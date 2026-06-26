# Migration Discipline — Schema Changes & Drift Prevention

Forward-only, generated, version-controlled migrations. This discipline exists
because ad-hoc `drizzle-kit push` partial-applied and produced `42P16` drift
across branches (the failure the `schema-drift-remediation` spec fixes).

## The Workflow (MANDATORY)

**generate → review → commit → migrate**, applied per branch in
`dev → test → pprd → prod` order (matches the git + Neon branch flow).

| Step | Command / Action | What It Does |
|------|------------------|--------------|
| **generate** | `bun run generate` | `drizzle-kit generate` — diffs `packages/db/src/schema` vs the snapshot, emits SQL + journal under `packages/db/migrations/` |
| **review** | read the emitted SQL | Inspect the generated DDL before it is trusted. No blind commits. |
| **commit** | `git add packages/db/migrations && git commit` | Version-control the SQL + journal together with the schema change |
| **migrate** | `bun run migrate` | Apply committed migrations to a branch over the **unpooled** `DATABASE_URL_UNPOOLED` connection (DDL only) |

Run `migrate` per branch in order: `dev`, then `test`, then `pprd`, then `prod`.

## Rules

| Rule | Detail |
|------|--------|
| **Forward-only** | Only add new migrations. NEVER edit, reorder, or delete a committed migration. Fix mistakes with a new forward migration. |
| **Baseline migration** | The committed Baseline_Migration represents the canonical schema. All later migrations build forward from it. |
| **Preserve `0001_pg_cron_jobs.sql`** | This special migration is kept as-is — never regenerate over it or drop it. |
| **`push` is local-only** | `drizzle-kit push` is RESERVED for throwaway local experimentation ONLY. NEVER run it against shared branches (`dev`/`test`/`pprd`/`prod`) — it partial-applies and caused the `42P16` drift this discipline remediates. |
| **Unpooled for DDL** | Migrations use `DATABASE_URL_UNPOOLED` (direct connection). The pooled connection is for app queries only. |

## CI Drift Gate

The `Drift_Gate` job in `.github/workflows/ci.yml` runs `drizzle-kit check` plus
a fingerprint reference test. **A PR that changes `packages/db/src/schema`
without a matching committed migration is rejected.** Code schema and committed
migration history must never diverge.

### DB-free fingerprint reference

CI has no Neon branch, so the canonical fingerprint cannot be derived from a
live catalog there. Instead the gate uses a committed, database-free reference:

- `packages/db/scripts/drift/snapshot-fingerprint.ts` derives a deterministic
  `SchemaFingerprint` from the committed drizzle snapshot
  (`packages/db/migrations/meta/0000_snapshot.json`) — the AUTHORITATIVE
  DB-free source of truth.
- `packages/db/scripts/drift/canonical-fingerprint.reference.json` is the
  committed `{ hash, version, fingerprint }` reference artifact.
- `scripts/drift/__tests__/canonical-reference.test.ts` re-derives the snapshot
  fingerprint at test time and asserts its hash equals the committed reference.
  It fails when the schema/snapshot changes without updating the reference.

**Regenerate flow** (after an intentional schema change):
`bun run generate` (rewrites the snapshot) → `bun run drift:reference`
(regenerates the reference artifact) → commit both with the migration.

## `test` / `pprd` Reset Tradeoff (RATIFIED — Req 9.3)

`test` and `pprd` are non-authoritative branches. To guarantee schema identity,
they are converged via `reset_from_parent` off canonical `prod` **after `prod`
is canonical**, which **discards their existing data**. This data loss is a
ratified, accepted tradeoff.

`prod` and `dev` are NEVER reset — they are forward-migrated with their data
preserved.

## Drift Tooling

For detecting and remediating drift (audit / verify-on-fork / rollout), see the
tooling under `packages/db/scripts/drift/` (`runner.ts` orchestrates
`fingerprint`, `diff`, `precheck`, `reconcile`, `canonical`, `neon-admin`,
`report`). Use it to fingerprint branches read-only and converge them to the
Canonical_Schema; never hand-edit drifted branches with `push`.
