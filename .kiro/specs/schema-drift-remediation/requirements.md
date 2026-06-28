# Requirements Document

## Introduction

The RGSS database (`@rgss/db`, Neon project `theroyalglow-db` /
`divine-heart-60915941`) spans four branches — `prod`, `dev`, `test`, `pprd` — all
originally forked from `prod` but now structurally divergent. An audit shows `prod`
and `dev` carry the same 38 tables but materially different constraint counts
(prod: 100 PKs / 72 uniques / 57 FKs / 99 indexes; dev: 120 / 69 / 83 / 96), and
`drizzle-kit push` currently fails mid-way with `42P16: column "id" is in a primary
key`, leaving partial applies. `test` and `pprd` are archived with presumed-divergent
state.

This feature establishes the **Drizzle schema code** (`packages/db/src/schema`) as
the single source of truth, reconciles all four branches to it so they become
schema-identical (byte-level fingerprint equality), and installs migration
discipline plus a CI drift gate so drift cannot recur. The work is deterministic,
idempotent, read-only during audit, and data-safe: every corrective DDL is gated by
a data pre-check and proven on a disposable Neon fork of `prod` before any real
branch is touched. Rollback relies on Neon point-in-time restore / branch-preserve
restore points rather than destructive undo DDL.

This document derives EARS requirements from `design.md`. Each requirement traces to
named design components (`fingerprint`, `catalog-queries`, `diff`, `precheck`,
`reconcile`, `neon-admin`, `runner`, `report`), to the Rollout decision model, to
the Error Handling scenarios, and to the eight Correctness Properties.

## Glossary

- **Canonical_Schema**: The structural schema derived from the Drizzle schema code
  in `packages/db/src/schema`, established as the single source of truth (design
  Pipeline phase 1 / `canonical.ts`).
- **Canonical_Fingerprint**: The `SchemaFingerprint` (and its hash) computed from
  the Canonical_Schema; the target every branch must equal.
- **Schema_Fingerprint**: A fully normalized, order-independent structural
  description of a schema covering enums, tables, columns (type, nullability,
  default), primary keys, uniques, foreign keys (incl. on-delete/on-update), and
  indexes (incl. partial predicates, uniqueness, method). Defined by the
  `SchemaFingerprint` data model.
- **Fingerprinter**: The pure `fingerprint` component that builds, serializes, and
  hashes a Schema_Fingerprint from raw catalog rows (`fingerprint.ts`).
- **Catalog_Reader**: The `catalog-queries` component holding the exact read-only
  `information_schema` / `pg_catalog` SQL scoped to `schema = 'public'`
  (`catalog-queries.ts`).
- **Schema_Differ**: The pure `diff` component producing a `SchemaDiff` between two
  fingerprints (`diff.ts`).
- **Schema_Diff**: The structured, total, symmetric set of `DiffEntry` records
  classifying each object as `missing_on_branch`, `extra_on_branch`, or
  `divergent`.
- **Pre_Checker**: The pure-plus-probe `precheck` component that derives and
  evaluates `DataPreCheck` predicates (`precheck.ts`).
- **Data_Pre_Check**: A read-only predicate (`duplicate_key`, `orphan_fk`, or
  `existing_null`) that must pass before an additive constraint DDL is applied.
- **Reconciler**: The pure `reconcile` component that turns a Schema_Diff into an
  ordered, idempotent `ReconcileStep` plan (`reconcile.ts`).
- **Reconcile_Plan**: The ordered list of `ReconcileStep` records, each binding a
  `DiffEntry`, idempotent DDL, an optional Data_Pre_Check, and an `order` value.
- **DDL_Order**: The dependency ordering of reconciliation steps:
  enums → columns → primary keys/uniques → indexes → foreign keys.
- **Neon_Admin**: The `neon-admin` adapter over the Neon Management API
  (fork, delete, reactivate, reset_from_parent, connection string).
- **Verify_Branch**: A disposable Neon branch forked from `prod` used to prove the
  Reconcile_Plan before touching real branches.
- **Drift_Runner**: The `runner` component that orchestrates audit, fork-verify, and
  rollout (the only effectful component).
- **Conformance_Report**: The `report` output listing diffs and Data_Pre_Check
  violations in markdown/json.
- **Forward_Migrate**: Applying verified DDL to a branch while preserving its
  existing data (used for `prod` and `dev`).
- **Reset_From_Parent**: Neon branch reset that makes a branch byte-identical to its
  parent, discarding the branch's existing data (used for archived `test` and
  `pprd` after `prod` is canonical).
- **Restore_Point**: A Neon point-in-time restore marker or retained pre-change
  branch captured immediately before applying DDL to a real branch, used for
  rollback.
- **Drift_Gate**: The CI job in `.github/workflows/ci.yml` that runs
  `drizzle-kit check` and/or a fingerprint reference test and fails the build when
  the code schema and committed migration history diverge.
- **Baseline_Migration**: The committed migration representing the Canonical_Schema,
  after which only forward-only generated migrations are added.
- **DATABASE_URL_UNPOOLED**: The unpooled (direct) Neon connection string required
  for DDL execution.

## Requirements

### Requirement 1: Canonical schema as single source of truth

**User Story:** As the RGSS database owner, I want the Drizzle schema code to be the
authoritative schema, so that every branch is reconciled toward the code and never
the reverse.

#### Acceptance Criteria

1. THE Schema_Drift_System SHALL derive the Canonical_Fingerprint from the Drizzle
   schema code in `packages/db/src/schema`, not from any live branch.
2. WHEN deriving the Canonical_Fingerprint, THE Schema_Drift_System SHALL apply the
   Drizzle code to an empty database and fingerprint the result.
3. THE Schema_Drift_System SHALL treat the Canonical_Fingerprint as the convergence
   target for all four branches `prod`, `dev`, `test`, and `pprd`.

### Requirement 2: Read-only structural audit

**User Story:** As the database owner, I want a read-only audit of each branch, so
that I can measure drift without risking production data.

#### Acceptance Criteria

1. WHEN auditing a branch, THE Catalog_Reader SHALL issue only `SELECT` statements
   against `information_schema` and `pg_catalog` scoped to `table_schema = 'public'`.
2. WHILE auditing any branch, THE Schema_Drift_System SHALL leave that branch's data
   and schema unchanged.
3. THE Catalog_Reader SHALL extract tables, columns with type and nullability and
   default, primary keys, uniques, foreign keys with `ON DELETE` and `ON UPDATE`,
   indexes with partial predicate and uniqueness and method, and enums with ordered
   labels.
4. THE Catalog_Reader SHALL return raw catalog rows without normalization.

### Requirement 3: Deterministic order-independent fingerprint

**User Story:** As an engineer, I want a deterministic schema fingerprint, so that
two schemas compare equal exactly when they are structurally identical.

#### Acceptance Criteria

1. WHEN building a Schema_Fingerprint from catalog rows, THE Fingerprinter SHALL
   produce identical serialized output regardless of input row order.
2. THE Fingerprinter SHALL normalize type spelling, default expressions, and
   nullability flags before comparison.
3. THE Fingerprinter SHALL sort tables, columns, constraints, and index members by
   name, while preserving ordinal order for primary-key columns, foreign-key
   column-to-reference pairings, and enum labels.
4. THE Fingerprinter SHALL exclude constraint names, OIDs, comment timestamps, and
   retired `pg_cron` job rows (if any remain) from structural equality.
5. WHEN two Schema_Fingerprints have equal hashes, THE Schema_Drift_System SHALL
   treat the schemas as structurally identical across tables, columns, types,
   nullability, defaults, primary keys, uniques, foreign keys with on-delete,
   indexes with predicates, and enums; and WHEN the hashes differ, THE
   Schema_Drift_System SHALL treat the schemas as not identical.

### Requirement 4: Total, symmetric structural diff

**User Story:** As an engineer, I want a structured diff between a branch and the
canonical schema, so that I can see every missing, extra, and divergent object.

#### Acceptance Criteria

1. WHEN comparing a branch fingerprint to the Canonical_Fingerprint, THE
   Schema_Differ SHALL classify each object as `missing_on_branch`,
   `extra_on_branch`, or `divergent`.
2. THE Schema_Differ SHALL account for every object present in either fingerprint in
   exactly one `DiffEntry`.
3. WHEN two fingerprints are equal, THE Schema_Differ SHALL report `isIdentical` as
   true; and WHEN they differ, THE Schema_Differ SHALL report `isIdentical` as
   false.
4. THE Schema_Differ SHALL produce the same identity verdict for `diff(c, b)` and
   `diff(b, c)`.

### Requirement 5: Data-safe pre-checks for additive constraints

**User Story:** As the database owner, I want every additive constraint gated by a
data pre-check, so that reconciliation never fails or mutates data unexpectedly.

#### Acceptance Criteria

1. WHERE a Reconcile_Step adds a UNIQUE or PRIMARY KEY constraint, THE Pre_Checker
   SHALL evaluate a `duplicate_key` Data_Pre_Check before the DDL runs.
2. WHERE a Reconcile_Step adds a foreign key, THE Pre_Checker SHALL evaluate an
   `orphan_fk` Data_Pre_Check for child rows with no matching parent before the DDL
   runs.
3. WHERE a Reconcile_Step adds a `NOT NULL` constraint, THE Pre_Checker SHALL
   evaluate an `existing_null` Data_Pre_Check before the DDL runs.
4. WHEN evaluating a Data_Pre_Check, THE Pre_Checker SHALL issue only read-only
   probe SQL and report violation count and a sample of violating rows.
5. IF a Data_Pre_Check reports a violation, THEN THE Schema_Drift_System SHALL skip
   that step's DDL, mark the step blocked, record the violation in the
   Conformance_Report, and continue with independent steps.
6. THE Schema_Drift_System SHALL NOT auto-mutate branch data to satisfy a
   Data_Pre_Check.
7. WHEN a Data_Pre_Check reports passed, THE Schema_Drift_System SHALL treat the
   corresponding additive constraint as safe to apply; and WHEN adding the
   constraint would fail, THE Pre_Checker SHALL report the Data_Pre_Check as not
   passed.

### Requirement 6: Idempotent, dependency-ordered reconciliation DDL

**User Story:** As an engineer, I want corrective DDL that is idempotent and
correctly ordered, so that I can re-run the plan safely after partial failures.

#### Acceptance Criteria

1. THE Reconciler SHALL emit corrective DDL using guarded forms
   (`IF NOT EXISTS` or catalog existence probes) so that applying the
   Reconcile_Plan twice yields the same fingerprint as applying it once.
2. THE Reconciler SHALL order steps as enums, then columns, then primary keys and
   uniques, then indexes, then foreign keys.
3. WHEN the Reconcile_Plan is applied in `step.order`, THE Schema_Drift_System SHALL
   NOT reference any schema object before that object exists.
4. THE Reconciler SHALL NOT use `drizzle-kit push` for reconciliation.
5. THE Reconciler SHALL bind each Reconcile_Step to its Data_Pre_Check so the DDL is
   skipped and reported when the pre-check fails.
6. WHERE a constraint must be redefined on a column participating in a primary key,
   THE Reconciler SHALL model it as drop-then-add gated by an explicit pre-check and
   SHALL require an operator-confirmed step rather than auto-applying.

### Requirement 7: Fork-verify before touching real branches

**User Story:** As the database owner, I want the plan proven on a disposable fork
of prod, so that no real branch is altered until convergence is verified.

#### Acceptance Criteria

1. WHEN verifying the Reconcile_Plan, THE Neon_Admin SHALL fork `prod` into a
   disposable Verify_Branch using an unpooled connection string for DDL.
2. WHEN the Verify_Branch is ready, THE Drift_Runner SHALL apply the entire
   Reconcile_Plan and run all Data_Pre_Checks on it.
3. THE Drift_Runner SHALL treat verification as successful only WHEN the
   Verify_Branch fingerprint equals the Canonical_Fingerprint AND all Data_Pre_Checks
   pass.
4. IF verification does not converge, THEN THE Drift_Runner SHALL abort rollout,
   delete the Verify_Branch, leave all real branches untouched, and regenerate the
   Conformance_Report.
5. WHEN verification succeeds, THE Drift_Runner SHALL apply the identical verified
   DDL to the real branches.

### Requirement 8: Safe rollout and convergence of all branches

**User Story:** As the database owner, I want all four branches reconciled with the
right strategy each, so that they become schema-identical to the canonical code
while live data is preserved.

#### Acceptance Criteria

1. WHEN rolling out to `prod`, THE Drift_Runner SHALL Forward_Migrate by applying the
   verified DDL and SHALL NOT reset the branch, preserving live data.
2. WHEN rolling out to `dev`, THE Drift_Runner SHALL Forward_Migrate by applying the
   verified DDL and SHALL NOT reset the branch, preserving in-progress dev data.
3. WHERE a branch is `test` or `pprd`, THE Drift_Runner SHALL converge it by
   Reset_From_Parent from `prod` after `prod` is canonical.
4. WHEN a branch scheduled for Reset_From_Parent is archived, THE Neon_Admin SHALL
   reactivate that branch before fingerprinting or resetting it.
5. WHEN rollout completes, THE Drift_Runner SHALL confirm that the fingerprint of
   each of `prod`, `dev`, `test`, and `pprd` equals the Canonical_Fingerprint.
6. IF any branch fingerprint does not equal the Canonical_Fingerprint after rollout,
   THEN THE Drift_Runner SHALL report the divergence in the Conformance_Report.

### Requirement 9: Ratified test/pprd data-loss tradeoff

**User Story:** As the database owner, I want the data loss from resetting test and
pprd explicitly acknowledged, so that the convergence strategy is a ratified
decision rather than an accident.

#### Acceptance Criteria

1. THE Schema_Drift_System SHALL Reset_From_Parent only the non-authoritative
   branches `test` and `pprd`, discarding their existing data.
2. THE Schema_Drift_System SHALL NOT apply Reset_From_Parent to `prod` or `dev`.
3. THE Conformance_Report SHALL state that `test` and `pprd` data is discarded by
   Reset_From_Parent as a ratified tradeoff for guaranteed schema identity.

### Requirement 10: Rollback via Neon restore points

**User Story:** As the database owner, I want a safe rollback path, so that any
failed apply on a real branch can be reverted without destructive undo DDL.

#### Acceptance Criteria

1. WHEN preparing to apply DDL to a real branch, THE Drift_Runner SHALL capture a
   Restore_Point for that branch before applying any DDL.
2. THE Schema_Drift_System SHALL NOT author destructive in-place undo DDL as a
   rollback mechanism.
3. IF DDL fails partway on a real branch, THEN THE Drift_Runner SHALL allow a safe
   idempotent re-run of the Reconcile_Plan to resume.
4. WHERE a failure cannot be resolved by re-run, THE Schema_Drift_System SHALL
   support restoring the branch to its captured Restore_Point.

### Requirement 11: Archived-branch handling during audit

**User Story:** As an engineer, I want archived branches handled gracefully, so that
auditing test and pprd does not block the rest of the pipeline.

#### Acceptance Criteria

1. WHEN an archived branch must be fingerprinted, THE Neon_Admin SHALL reactivate it
   before reading its catalog.
2. IF reactivation of an archived branch fails, THEN THE Drift_Runner SHALL record
   the failure in the Conformance_Report and continue processing the other branches.

### Requirement 12: Drift prevention via migration discipline and CI gate

**User Story:** As the database owner, I want migration discipline and an automated
drift gate, so that schema drift cannot recur after reconciliation.

#### Acceptance Criteria

1. THE Schema_Drift_System SHALL adopt `drizzle-kit generate` with committed,
   version-controlled SQL migrations under `packages/db/migrations/`.
2. THE Schema_Drift_System SHALL note that the old `0001_pg_cron_jobs.sql`
   migration has been removed (pg_cron retired — all jobs now run as QStash HTTP routes).
3. THE Schema_Drift_System SHALL establish a committed Baseline_Migration
   representing the Canonical_Schema and add only forward-only migrations
   thereafter.
4. THE Drift_Gate SHALL run `drizzle-kit check` and/or a fingerprint reference test
   in `.github/workflows/ci.yml`.
5. WHEN the code schema and the committed migration history diverge, THE Drift_Gate
   SHALL fail the build.
6. THE Schema_Drift_System SHALL provide a steering document describing the migration
   workflow of generate, review, commit, and migrate per branch in
   `dev → test → pprd → prod` order.

### Requirement 13: Correctness property verification

**User Story:** As an engineer, I want the eight design correctness properties
verified by automated tests, so that the pure logic and integration behavior are
provably correct.

#### Acceptance Criteria

1. THE Schema_Drift_System SHALL verify fingerprint determinism and
   order-independence (design Property 1) by property-based tests over randomly
   ordered catalog rows.
2. THE Schema_Drift_System SHALL verify fingerprint equality soundness (design
   Property 2) by property-based tests asserting hash equality iff structural
   identity.
3. THE Schema_Drift_System SHALL verify diff totality and symmetry (design
   Property 3) by property-based tests over generated fingerprint pairs.
4. THE Schema_Drift_System SHALL verify pre-check soundness (design Property 4) by
   property-based tests asserting a violation is reported iff one exists, with no
   false negatives.
5. THE Schema_Drift_System SHALL verify reconciliation idempotence (design
   Property 5) by property-based tests asserting that applying the plan twice equals
   applying it once under a modeled apply.
6. THE Schema_Drift_System SHALL verify ordering safety (design Property 7) by
   property-based tests asserting no step forward-references a not-yet-created
   object.
7. THE Schema_Drift_System SHALL verify convergence to canonical (design Property 6)
   by an integration assertion on a Neon fork that the post-rollout fingerprint
   equals the Canonical_Fingerprint.
8. THE Schema_Drift_System SHALL verify read-only audit (design Property 8) by
   asserting that fingerprint and pre-check executions issue only `SELECT`
   statements and leave the audited branch unchanged.
9. THE Schema_Drift_System SHALL run each property-based test for at least 100
   iterations.

### Requirement 14: Operational and security constraints

**User Story:** As the database owner, I want the audit and credentials handled
safely, so that running the tool does not leak secrets or perform unsafe writes.

#### Acceptance Criteria

1. THE Schema_Drift_System SHALL keep the audit phase strictly read-only.
2. THE Schema_Drift_System SHALL NOT author destructive in-place undo DDL.
3. WHERE DDL execution is required, THE Schema_Drift_System SHALL use the unpooled
   `DATABASE_URL_UNPOOLED` connection string.
4. WHERE the Neon Management API is invoked, THE Schema_Drift_System SHALL read the
   Neon API key from the environment and SHALL NOT commit it to the repository.
