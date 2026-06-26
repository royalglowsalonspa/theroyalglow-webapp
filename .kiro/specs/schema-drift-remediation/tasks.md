# Implementation Plan: Schema Drift Remediation

## Overview

This plan converts the Schema Drift Remediation design into discrete, incremental coding steps for `@rgss/db` (Bun + TypeScript strict, Drizzle ORM, Neon serverless). It follows the pipeline order from the design: shared types → read-only catalog reader → pure fingerprint → pure diff → data pre-checks → ordered idempotent reconcile → canonical derivation → Neon admin adapter → report rendering → runner orchestration → integration verification on a Neon fork → migration baseline + CI drift gate + steering discipline. Each step builds on the previous ones and ends by wiring code into the runner, the CI workflow, or a committed migration so nothing is orphaned.

All tooling lives under `packages/db/scripts/drift/`. Pure modules (`fingerprint`, `diff`, `precheck.plan`, `reconcile`, `canonical`) carry no I/O so they are unit- and property-testable in isolation; the Neon Management API and SQL execution sit behind adapter interfaces (`catalog-queries`, `neon-admin`).

Property-based tests are included as separate sub-tasks — one per pure correctness property from the design (Properties 1, 2, 3, 4, 5, 7). Every property test uses **`fast-check` + Vitest** (already a `@rgss/db` devDependency), runs a **minimum of 100 iterations** (Requirement 13.9), exercises only pure functions, and carries the tag comment:

```
// Feature: schema-drift-remediation, Property {n}: {title}
```

Properties 6 (convergence) and 8 (read-only audit) are verified by **integration assertions on a disposable Neon fork**, not by PBT, and live in task 12.

Conventions enforced throughout (per steering and design): the audit phase is strictly read-only (`SELECT` only); DDL execution uses the unpooled `DATABASE_URL_UNPOOLED` string; `neon-http` has **no interactive transactions** so reconciliation uses `db.batch()` / guarded CTEs / ordered single statements; money is integer paise, PKs are `text` nanoid, timestamps are `timestamptz`, tables are `snake_case` singular, FKs use explicit `ON DELETE`; the Neon API key is read from the environment and never committed; reconciliation **abandons `drizzle-kit push`** in favor of idempotent ordered additive DDL; live DB operations are mediated through the Neon Kiro power and no destructive SQL is run autonomously.

> Test sub-tasks are marked with `*` and are optional (skippable for a faster MVP). Core implementation sub-tasks are never optional.

## Tasks

- [x] 1. Scaffold drift tooling structure and shared types
  - [x] 1.1 Create `packages/db/scripts/drift/types.ts` with the shared data models
    - Define `SchemaFingerprint`, `EnumFp`, `TableFp`, `ColumnFp`, `ConstraintFp`, `FkFp`, `IndexFp` exactly as in the design Data Models, including the `version: 1` format tag
    - Define `CatalogRows` and the raw row types (`TableRow`, `ColumnRow`, `PkRow`, `UniqueRow`, `FkRow`, `IndexRow`, `EnumRow`)
    - Define `SchemaDiff`, `DiffEntry`, `ReconcileStep`, `DataPreCheck`, `PreCheckResult`, and the `BranchId` alias
    - _Requirements: 3.3, 3.4, 4.1, 5.1, 6.2_

- [x] 2. Read-only catalog reader (`catalog-queries.ts`)
  - [x] 2.1 Implement the `CatalogReader` interface with the six read-only queries
    - `readTables`, `readColumns` (type, nullability, default), `readPrimaryKeys`, `readUniques`, `readForeignKeys` (incl. `confdeltype`/`confupdtype`), `readIndexes` (incl. partial predicate, uniqueness, method), `readEnums` (type + ordered labels), using the exact query shapes from the design scoped to `table_schema = 'public'` / `n.nspname = 'public'`
    - Issue only `SELECT` statements and return plain rows without normalization
    - _Requirements: 2.1, 2.3, 2.4, 14.1_
  - [ ]* 2.2 Write unit/snapshot tests for the catalog queries
    - Snapshot the query strings; assert every query is `SELECT`-only and `public`-scoped (no write keywords)
    - _Requirements: 2.1, 14.1_

- [x] 3. Pure fingerprinter (`fingerprint.ts`)
  - [x] 3.1 Implement `build`, `serialize`, and `hash`
    - `build(rows)` normalizes type spelling (`int4`→`integer`, canonical `timestamptz`), default expressions, and nullability; sorts tables/columns/constraints/index-members by name while preserving ordinal order for PK columns, FK column↔refColumn pairings, and enum labels; excludes constraint names, OIDs, comment timestamps, and `pg_cron` rows
    - `serialize` produces stable canonical JSON; `hash` returns the `sha256` of `serialize`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_
  - [ ]* 3.2 Write property test for fingerprint determinism / order-independence
    - **Property 1: Fingerprint determinism / order-independence**
    - **Validates: Requirements 3.1, 13.1**
    - Generate random catalog row-sets, emit them in random permutations, assert `serialize(build(R)) === serialize(build(π(R)))`; ≥100 runs, tag `// Feature: schema-drift-remediation, Property 1: Fingerprint determinism / order-independence`
  - [ ]* 3.3 Write property test for fingerprint equality soundness
    - **Property 2: Fingerprint equality soundness**
    - **Validates: Requirements 3.5, 13.2**
    - Generate schema models; assert `hash(build(A)) === hash(build(B))` iff `A` and `B` are structurally identical (tables/columns/types/nullability/defaults/PKs/uniques/FKs+on-delete/indexes+predicates/enums); ≥100 runs, tag `// Feature: schema-drift-remediation, Property 2: Fingerprint equality soundness`

- [x] 4. Pure structural differ (`diff.ts`)
  - [x] 4.1 Implement `diff` and `equal`
    - Classify each object as `missing_on_branch`, `extra_on_branch`, or `divergent`; account for every object in either fingerprint in exactly one `DiffEntry`; set `isIdentical = objects.length === 0`; `equal` returns hash equality
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  - [ ]* 4.2 Write property test for diff totality and symmetry
    - **Property 3: Diff totality & symmetry**
    - **Validates: Requirements 4.2, 4.4, 13.3**
    - Generate fingerprint pairs; assert every object appears in exactly one `DiffEntry` and `diff(c,b).isIdentical ⟺ equal(c,b) ⟺ diff(b,c).isIdentical`; ≥100 runs, tag `// Feature: schema-drift-remediation, Property 3: Diff totality & symmetry`

- [x] 5. Data pre-checks (`precheck.ts`)
  - [x] 5.1 Implement the pure `plan(diff)` predicate generator
    - Emit a `duplicate_key` check for each added UNIQUE/PK, an `orphan_fk` check for each added FK, and an `existing_null` check for each added `NOT NULL`; each `DataPreCheck` carries read-only `probeSql` and a description
    - _Requirements: 5.1, 5.2, 5.3_
  - [x] 5.2 Implement the `evaluate(check, reader)` probe runner
    - Run the read-only `probeSql`, return `PreCheckResult` with `passed`, `violationCount`, and a bounded `sample` of violating rows; `passed === true` means the additive constraint is safe to apply, and a constraint that would fail is reported as not passed; never auto-mutate branch data
    - _Requirements: 5.4, 5.6, 5.7_
  - [ ]* 5.3 Write property test for pre-check soundness
    - **Property 4: Pre-check soundness**
    - **Validates: Requirements 5.7, 13.4**
    - Generate small datasets with and without violations; assert a violation is reported iff one exists, with no false negatives (never green-lights a constraint that would fail); ≥100 runs, tag `// Feature: schema-drift-remediation, Property 4: Pre-check soundness`
  - [ ]* 5.4 Write unit tests for blocked-step handling
    - Assert a violating check causes the bound step to be skipped, marked blocked, and recorded, while independent steps continue; assert no data-mutation SQL is emitted
    - _Requirements: 5.5, 5.6_

- [x] 6. Ordered idempotent reconciler (`reconcile.ts`)
  - [x] 6.1 Implement `plan(diff)` producing ordered idempotent `ReconcileStep[]`
    - Emit guarded DDL (`ADD CONSTRAINT` / `CREATE [UNIQUE] INDEX IF NOT EXISTS` / `ALTER ...` / `CREATE TYPE`) with `IF NOT EXISTS` or catalog existence probes so applying the plan twice equals once; order steps enums → columns → PK/unique → indexes → FKs via `step.order`; bind each step to its `DataPreCheck`; never emit `drizzle-kit push`; model PK-column constraint redefinition as drop-then-add gated by a pre-check and flagged as operator-confirmed (never auto-applied)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_
  - [ ]* 6.2 Write property test for reconciliation idempotence
    - **Property 5: Reconciliation idempotence**
    - **Validates: Requirements 6.1, 13.5**
    - Generate diffs; under a modeled `apply`, assert `apply(apply(B, P), P)` has the same fingerprint as `apply(B, P)`; ≥100 runs, tag `// Feature: schema-drift-remediation, Property 5: Reconciliation idempotence`
  - [ ]* 6.3 Write property test for ordering safety
    - **Property 7: Ordering safety**
    - **Validates: Requirements 6.3, 13.6**
    - Generate plans; assert applying in `step.order` never references an object before it exists (enums → columns → pk/unique → indexes → fks); ≥100 runs, tag `// Feature: schema-drift-remediation, Property 7: Ordering safety`

- [x] 7. Canonical schema derivation (`canonical.ts`)
  - [x] 7.1 Derive the Canonical_Fingerprint from the Drizzle code
    - Apply the Drizzle schema in `packages/db/src/schema` to an empty database (via `drizzle-kit export`/baseline into a throwaway DB), read its catalog through `catalog-queries`, and fingerprint it; treat the result as the convergence target for all four branches, never derived from a live branch
    - _Requirements: 1.1, 1.2, 1.3_

- [x] 8. Neon Management API adapter (`neon-admin.ts`)
  - [x] 8.1 Implement the `NeonAdmin` adapter
    - `forkBranch`, `deleteBranch`, `reactivate` (un-archive), `resetFromParent`, and `connectionString` (returning the unpooled `DATABASE_URL_UNPOOLED` form for DDL); read the Neon API key from the environment and never commit it
    - _Requirements: 7.1, 8.3, 8.4, 11.1, 14.3, 14.4_

- [x] 9. Conformance and diff report renderer (`report.ts`)
  - [x] 9.1 Implement markdown/json rendering of diffs and conformance
    - Render `DiffEntry` lists and `DataPreCheck` violations (counts + samples); state explicitly that `test` and `pprd` data is discarded by `reset_from_parent` as a ratified tradeoff for guaranteed schema identity; render post-rollout per-branch divergence
    - _Requirements: 5.5, 8.6, 9.3, 11.2_
  - [ ]* 9.2 Write unit test for deterministic report rendering
    - Assert fixed inputs produce stable markdown/json output, including the ratified data-loss note
    - _Requirements: 9.3_

- [x] 10. Runner orchestration (`runner.ts`)
  - [x] 10.1 Implement `audit(branches)`
    - Fingerprint each branch read-only via `catalog-queries` + `fingerprint`; reactivate archived `test`/`pprd` before reading and, if reactivation fails, record it in the report and continue with the other branches; leave every audited branch's data and schema unchanged
    - _Requirements: 2.2, 11.1, 11.2, 14.1_
  - [x] 10.2 Implement `verifyOnFork(plan)`
    - Fork `prod` into a disposable Verify_Branch over an unpooled connection, apply the entire reconcile plan, run all data pre-checks, and treat verification as successful only when the fork fingerprint equals canonical AND all pre-checks pass; on non-convergence, abort rollout, delete the fork, leave real branches untouched, and regenerate the conformance report
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 14.3_
  - [x] 10.3 Implement `rollout(plan, branches)`
    - Capture a Restore_Point per real branch before any DDL; forward-migrate `prod` and `dev` with the verified DDL without resetting them; converge `test` and `pprd` by `reset_from_parent` from `prod` after `prod` is canonical (never resetting `prod`/`dev`); allow safe idempotent re-run on partial failure and support restoring from the captured Restore_Point; confirm every branch fingerprint equals canonical and report any divergence; never author destructive in-place undo DDL
    - _Requirements: 7.5, 8.1, 8.2, 8.3, 8.5, 8.6, 9.1, 9.2, 10.1, 10.2, 10.3, 10.4, 14.2_

- [x] 11. Checkpoint - pure pipeline and orchestration wired
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 12. Integration verification on a Neon fork
  - [ ]* 12.1 Write convergence integration test
    - **Property 6: Convergence to canonical**
    - **Validates: Requirements 8.5, 13.7**
    - On a `prod` fork, apply the full verified plan and assert the post-rollout fingerprint equals the Canonical_Fingerprint and all pre-checks pass
  - [ ]* 12.2 Write read-only audit integration test
    - **Property 8: Read-only audit**
    - **Validates: Requirements 2.2, 13.8**
    - Assert fingerprint and pre-check executions issue only `SELECT` statements and leave the audited fork's data and schema unchanged
  - [ ]* 12.3 Write seeded-violation and idempotence integration test
    - Seed deliberate duplicate-key/orphan-FK violations on a fork; assert the matching object is blocked and reported while independent steps still apply; apply the plan twice and assert an identical fingerprint
    - _Requirements: 5.5, 6.1_

- [x] 13. Migration discipline baseline
  - [x] 13.1 Establish the committed Baseline_Migration
    - Adopt `drizzle-kit generate` with committed SQL migrations under `packages/db/migrations/`; generate the baseline migration representing the Canonical_Schema while preserving the existing special `0001_pg_cron_jobs.sql`; add only forward-only migrations thereafter
    - _Requirements: 12.1, 12.2, 12.3_

- [x] 14. CI drift gate
  - [x] 14.1 Add the Drift_Gate job to `.github/workflows/ci.yml`
    - Run `drizzle-kit check` and the fingerprint reference test; fail the build when the code schema and the committed migration history diverge (e.g. a PR changes `packages/db/src/schema` without a matching committed migration)
    - _Requirements: 12.4, 12.5_
  - [x] 14.2 Commit a reference fingerprint and fingerprint reference test
    - Persist the canonical fingerprint produced by `canonical.ts` as a committed reference artifact and add a Vitest check comparing the freshly derived canonical fingerprint to it
    - _Requirements: 12.4, 12.5_

- [x] 15. Migration discipline steering document
  - [x] 15.1 Create the migration-discipline steering doc
    - Document the generate → review → commit → migrate workflow per branch in `dev → test → pprd → prod` order; record that `push` is reserved for throwaway local experimentation only; restate the ratified `test`/`pprd` `reset_from_parent` data-loss tradeoff
    - _Requirements: 12.6, 9.3_

- [x] 16. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP.
- Each task references specific requirement sub-clauses for traceability.
- Property-based tests (Properties 1, 2, 3, 4, 5, 7) use `fast-check` + Vitest, run ≥100 iterations, and exercise pure functions only.
- Properties 6 and 8 are verified by integration assertions on a disposable Neon fork (task 12), not by PBT.
- The audit phase is strictly read-only; all DDL uses the unpooled `DATABASE_URL_UNPOOLED` string; reconciliation abandons `drizzle-kit push` for guarded idempotent ordered DDL.
- Live Neon branch operations (fork/reset/reactivate/restore) run through the Neon Kiro power; no destructive SQL is executed autonomously.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "3.1", "8.1"] },
    { "id": 2, "tasks": ["2.2", "3.2", "3.3", "4.1", "5.1", "7.1"] },
    { "id": 3, "tasks": ["4.2", "5.2", "6.1", "9.1", "10.1"] },
    { "id": 4, "tasks": ["5.3", "5.4", "6.2", "6.3", "9.2", "10.2"] },
    { "id": 5, "tasks": ["10.3", "12.1", "12.2", "12.3"] },
    { "id": 6, "tasks": ["13.1"] },
    { "id": 7, "tasks": ["14.1", "14.2", "15.1"] }
  ]
}
```
