/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-09-2026 & Updated - 04-09-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : drift/__tests__/readonly-audit.integration.test
 * Scope        : Schema Drift Remediation — live read-only audit verification
 *
 * Feature      : schema-drift-remediation
 * Task         : 12.2 — Write read-only audit integration test
 * Property     : Property 8 — Read-only audit
 * Validates    : Requirements 2.2, 13.8
 *
 *   Req 2.2  : "WHILE auditing any branch, THE Schema_Drift_System SHALL leave
 *              that branch's data and schema unchanged."
 *   Req 13.8 : "THE Schema_Drift_System SHALL verify read-only audit (design
 *              Property 8) by asserting that fingerprint and pre-check
 *              executions issue only `SELECT` statements and leave the audited
 *              branch unchanged."
 *
 * Description  : Proves Property 8 end-to-end against REAL Neon on a disposable
 *                fork of `prod`, through TWO INDEPENDENT LINES OF EVIDENCE:
 *
 *   1. STATEMENT-LEVEL PROOF. The fork's `SqlExecutor` is wrapped in a
 *      recording proxy, and BOTH audit-path phases are driven through it:
 *        - `runner.audit([fork])` — the real orchestration path, which issues
 *          the seven `catalog-queries` reads and fingerprints the result; and
 *        - `PreChecker.evaluate` — over every `DataPreCheck` that
 *          `PreChecker.plan` derives from a real `diff(canonical, fork)`.
 *      Every captured statement is then asserted to lead with `SELECT` (or a
 *      read-only `WITH ... SELECT`) and to contain NO write/DDL keyword.
 *
 *   2. OBSERVABLE-STATE PROOF. The fork's fingerprint (serialized bytes AND
 *      hash) plus an exact per-table row census are captured BEFORE the audit
 *      and again AFTER it, and asserted byte-identical. Schema unchanged AND
 *      data unchanged — measured, not inferred from the statement text.
 *
 * Keyword matcher : Write detection strips block/line comments, single-quoted
 *                literals, double-quoted identifiers and dollar-quoted bodies,
 *                then word-boundary matches the write/DDL keyword set. Word
 *                boundaries are what keep legitimate identifiers such as
 *                `updated_at`, `deleted_at`, `created_at`, `alteration_note`,
 *                `setting_key` and `dropoff_at` from producing a false
 *                positive. Because a matcher that flags nothing would pass
 *                vacuously, the suite carries a NEGATIVE CONTROL: one real
 *                write/DDL statement per keyword is fed to the matcher (as a
 *                STRING — never executed) and asserted to BE flagged, plus
 *                lookalike-identifier `SELECT`s asserted NOT to be flagged.
 *
 * Row census     : `count(*)` per `public` table, driven in a SINGLE query off
 *                `pg_class` via `query_to_xml`. `count(*)` is used rather than
 *                `pg_stat_user_tables.n_live_tup` deliberately:
 *                `n_live_tup` is a STATISTICS ESTIMATE refreshed by
 *                autovacuum/ANALYZE, so it can change between two reads with
 *                no data change at all — it would make this assertion both
 *                flaky and unsound as evidence. `count(*)` is exact.
 *
 * Why drift is seeded first : realistic pre-checks need a non-empty plan. An
 *                untouched `prod` fork yields an EMPTY reconcile plan and NO
 *                `DataPreCheck` at all (see "Recorded observations"), so the
 *                pre-check half of the statement-level proof would be vacuous.
 *                The suite therefore seeds four structural divergences on the
 *                DISPOSABLE fork so that `PreChecker.plan` emits all three
 *                check kinds (`existing_null`, `duplicate_key`, `orphan_fk`).
 *                CRITICALLY, ALL SEEDING HAPPENS BEFORE THE BEFORE-SNAPSHOT —
 *                the audited fork is never mutated between the two snapshots,
 *                so the seeds cannot contaminate the unchanged-state proof.
 *
 * Recorded observations (live run, `prod` = br-bold-cake-aotql242) :
 *   1. `prod` differs from canonical in EXACTLY one object: `public."user".role`
 *      carries no column default while canonical has `DEFAULT 'customer'::text`.
 *   2. `reconcile.ts` emits NO step for a divergent column DEFAULT, so an
 *      untouched `prod` fork produces an empty plan. Not repaired here — that
 *      is a recorded open finding, out of this task's scope.
 *   3. The seeded divergences are chosen so every derived probe is VALID SQL
 *      against the un-mutated fork: a dropped column would leave
 *      `existing_null` probing a non-existent column, so the NOT NULL case is
 *      seeded as `DROP NOT NULL` (the column stays) instead.
 *
 * Skip behaviour : Guarded by `describe.skipIf(!isDriftForkAvailable())`, which
 *                requires BOTH a live `DATABASE_URL` and a `NEON_API_KEY`. CI
 *                has neither, so the suite SKIPS there instead of failing the
 *                pipeline. Excluded from `bun run test` by the
 *                `.integration.test.ts` suffix; run via `bun run test:integration`.
 *
 * SAFETY (non-negotiable) : `prod`, `dev`, `test` and `pprd` are NEVER written
 *                to. Every statement in this suite lands on a disposable
 *                `zz-drift-verify-*` fork; `prod` is only ever a fork PARENT and
 *                a read-only catalog source. No `resetFromParent` is called on
 *                any branch, and the archived `test`/`pprd` branches are never
 *                reactivated. Both forks are deleted in a final test PLUS an
 *                `afterAll` that runs even when an assertion fails, and
 *                `survivingThrowawayBranches()` PROVES no orphan remains. The
 *                Neon API key and connection strings are never logged.
 *
 * Fixture constraint : no fixture reintroduces pg_cron or `cron.schedule`
 *                objects — pg_cron is RETIRED (QStash scheduled HTTP jobs
 *                replaced it) and `fingerprint.ts` excludes retired pg_cron
 *                rows, so such a fixture would be both off-canonical and
 *                invisible to the fingerprint.
 *
 * Tech Stack   : Vitest, Neon serverless + Management API, Drizzle Kit
 * Layer        : Data Access (Test)
 *
 * Dependencies : vitest, ./live-fork, ../canonical, ../catalog-queries,
 *                ../diff, ../fingerprint, ../precheck, ../runner, ../types
 *
 * Notes        : Neon control-plane operations are polled and slow (fork,
 *                endpoint, delete) and canonical derivation materializes the
 *                full 38-table schema statement-by-statement over neon-http, so
 *                the hooks and tests carry MINUTE-scale timeouts.
 ************************************************************/

// Feature: schema-drift-remediation, Property 8: Read-only audit

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { CanonicalFingerprint } from '../canonical'
import { createCatalogReader, type SqlExecutor } from '../catalog-queries'
import { SchemaDiffer } from '../diff'
import { Fingerprinter } from '../fingerprint'
import { PreChecker, type ProbeReader } from '../precheck'
import { type AuditReport, createDriftRunner } from '../runner'
import type { BranchId, DataPreCheck, PreCheckResult, SchemaFingerprint } from '../types'
import {
  canonicalOnFork,
  deleteFork,
  fingerprintOf,
  forkProd,
  isDriftForkAvailable,
  neonAdmin,
  PROD_BRANCH_ID,
  survivingThrowawayBranches,
} from './live-fork'

const LIVE = isDriftForkAvailable()

/** Neon control-plane work is polled; allow minutes, not seconds. */
const SETUP_TIMEOUT_MS = 20 * 60 * 1000
const TEST_TIMEOUT_MS = 15 * 60 * 1000
const CLEANUP_TIMEOUT_MS = 5 * 60 * 1000

/**
 * The four REAL branches of `theroyalglow-db`. Listed only so the suite can
 * ASSERT it never targets one of them with a write. Mirrors `runner.ts`.
 */
const REAL_BRANCH_IDS: ReadonlySet<BranchId> = new Set<BranchId>([
  PROD_BRANCH_ID, // prod
  'br-rapid-block-aoh6m3q0', // dev
  'br-floral-waterfall-aoag027c', // test
  'br-super-king-aoqdtfor', // pprd
])

// ─────────────────────────────────────────────────────────
// Read-only statement matcher.
// ─────────────────────────────────────────────────────────

/**
 * Every keyword that would make a statement a write or a DDL/DCL/maintenance
 * operation. `SET`, `CALL`, `DO`, `LOCK`, `VACUUM`, `REINDEX` and `CLUSTER` are
 * included even though they are not writes in the narrow sense: none of them
 * belongs in a strictly read-only audit path.
 */
const WRITE_KEYWORDS = [
  'INSERT',
  'UPDATE',
  'DELETE',
  'TRUNCATE',
  'MERGE',
  'CREATE',
  'ALTER',
  'DROP',
  'GRANT',
  'REVOKE',
  'COMMENT',
  'REFRESH',
  'SET',
  'COPY',
  'CALL',
  'DO',
  'LOCK',
  'VACUUM',
  'REINDEX',
  'CLUSTER',
] as const

/**
 * Reduce a statement to its bare SQL code: comments, string literals, quoted
 * identifiers and dollar-quoted bodies are replaced with inert placeholders, so
 * keyword scanning never trips over data or over an identifier that merely
 * happens to spell a keyword.
 */
function stripNonCode(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ') // block comments
    .replace(/--[^\n]*/g, ' ') // line comments
    .replace(/\$\$[\s\S]*?\$\$/g, ' ') // dollar-quoted bodies
    .replace(/'(?:[^']|'')*'/g, "''") // single-quoted literals
    .replace(/"(?:[^"]|"")*"/g, '""') // double-quoted identifiers
}

/**
 * The write/DDL keywords present in a statement, matched on WORD BOUNDARIES.
 * Word boundaries are what make `updated_at`, `deleted_at`, `created_at`,
 * `alteration_note`, `setting_key`, `insertion_id` and `dropoff_at` safe: the
 * keyword is followed by a word character, so `\bUPDATE\b` and friends do not
 * match. A genuine `UPDATE "x" SET ...` is still caught (negative control
 * below proves it).
 */
function writeKeywordsIn(sql: string): string[] {
  const code = stripNonCode(sql)
  return WRITE_KEYWORDS.filter((keyword) => new RegExp(`\\b${keyword}\\b`, 'i').test(code))
}

/** The first bare-SQL keyword of a statement, upper-cased (`''` when none). */
function leadingKeyword(sql: string): string {
  const match = /^[A-Za-z]+/.exec(stripNonCode(sql).trim())
  return (match?.[0] ?? '').toUpperCase()
}

/**
 * A statement is read-only iff it LEADS with `SELECT` (or a `WITH ... SELECT`
 * CTE) AND contains no write/DDL keyword anywhere.
 */
function isReadOnlyStatement(sql: string): boolean {
  const leading = leadingKeyword(sql)
  return (leading === 'SELECT' || leading === 'WITH') && writeKeywordsIn(sql).length === 0
}

// ─────────────────────────────────────────────────────────
// Recording executor — the statement-level probe.
// ─────────────────────────────────────────────────────────

type Recorder = {
  /** Every SQL string passed through the proxy, in issue order. */
  statements: string[]
  /** Drop-in `SqlExecutor` replacement that records then delegates. */
  exec: SqlExecutor
}

/** Wrap a `SqlExecutor` so every statement it is asked to run is captured. */
function recordingExecutor(inner: SqlExecutor): Recorder {
  const statements: string[] = []
  const exec: SqlExecutor = <Row>(query: string): Promise<Row[]> => {
    statements.push(query)
    return inner<Row>(query)
  }
  return { exec, statements }
}

// ─────────────────────────────────────────────────────────
// Seeded divergences.
//
// Chosen so `PreChecker.plan` emits all three check kinds AND every derived
// probe is valid SQL against the UN-MUTATED fork:
//   - `DROP NOT NULL` (not `DROP COLUMN`) keeps `business_hour.is_open` present,
//     so its `existing_null` probe can actually run.
//   - dropping `business_hour_day_of_week_unique` yields a `duplicate_key` probe
//     over columns that still exist.
//   - dropping two foreign keys yields `orphan_fk` probes whose child AND parent
//     tables both still exist.
// `business_hour` has no foreign keys and is referenced by none, so seeding it
// cannot disturb the attnum -> column resolution `fingerprint.ts` relies on.
// ─────────────────────────────────────────────────────────

const SEED_NULLABLE = { table: 'business_hour', column: 'is_open' } as const
const SEED_UNIQUE = { table: 'business_hour', columns: ['day_of_week'] } as const
const SEED_FOREIGN_KEYS = [
  { table: 'audit_log', columns: ['actor_id'] },
  { table: 'notification', columns: ['user_id'] },
] as const

/**
 * Exact `DataPreCheck` census the seeded divergences must produce — one per
 * seed, covering all three kinds:
 *   - `existing_null` : `business_hour.is_open` became nullable on the branch
 *                       while canonical keeps it NOT NULL (a divergent-column
 *                       tightening).
 *   - `duplicate_key` : TWO — the dropped UNIQUE on `business_hour(day_of_week)`
 *                       AND its backing unique index, which `catalog-queries.ts`
 *                       reports as a separate diff entry (only `indisprimary` is
 *                       excluded). Since the Finding-2 fix, that index carries
 *                       its own `duplicate_key` gate instead of being an ungated
 *                       `CREATE UNIQUE INDEX`.
 *   - `orphan_fk`     : one per dropped foreign key.
 * `prod`'s one inherited divergence (`user.role`'s missing DEFAULT) needs no
 * pre-check — a DEFAULT change rewrites no rows and can violate nothing — even
 * though the reconciler now emits a step for it.
 */
const EXPECTED_CHECK_COUNTS: Readonly<Record<DataPreCheck['kind'], number>> = {
  duplicate_key: 2,
  existing_null: 1,
  orphan_fk: SEED_FOREIGN_KEYS.length,
}

/** Total pre-checks expected: 2 + 1 + 2 = 5. */
const EXPECTED_PRE_CHECKS = Object.values(EXPECTED_CHECK_COUNTS).reduce((a, b) => a + b, 0)

/** `readCatalog` issues exactly one `SELECT` per catalog object class. */
const CATALOG_QUERY_COUNT = 7

// ─────────────────────────────────────────────────────────
// SQL helpers. Identifiers come from our own catalog (never user input) but are
// still double-quoted + escaped, matching `reconcile.ts`.
// ─────────────────────────────────────────────────────────

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

type ConstraintRow = { conname: string; def: string }

/** Column names in the first parenthesised group of a catalog definition, sorted. */
function definitionColumns(definition: string): string[] {
  const open = definition.indexOf('(')
  const close = definition.indexOf(')', open)
  if (open === -1 || close === -1) return []
  return definition
    .slice(open + 1, close)
    .split(',')
    .map((member) => member.trim().replace(/"/g, ''))
    .filter((member) => member !== '')
    .sort()
}

function sameColumnSet(definition: string, columns: readonly string[]): boolean {
  const found = definitionColumns(definition)
  const wanted = [...columns].sort()
  return found.length === wanted.length && found.every((name, i) => name === wanted[i])
}

/** Resolve a constraint of a given `contype` by its exact column set. */
async function findConstraintName(
  exec: SqlExecutor,
  table: string,
  contype: 'u' | 'f',
  columns: readonly string[],
): Promise<string | null> {
  const rows = await exec<ConstraintRow>(
    `SELECT con.conname, pg_get_constraintdef(con.oid) AS def
     FROM pg_constraint con
     JOIN pg_class c ON c.oid = con.conrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = ${quoteLiteral(table)}
       AND con.contype = ${quoteLiteral(contype)}`,
  )
  const match = rows.find((row) => sameColumnSet(row.def, columns))
  return match?.conname ?? null
}

// ─────────────────────────────────────────────────────────
// Data census — exact row counts across every `public` table.
// ─────────────────────────────────────────────────────────

type CensusRow = { table_name: string; row_count: unknown }

/**
 * ONE query returning an exact `count(*)` per `public` base table, driven off
 * `pg_class` through `query_to_xml`.
 *
 * `count(*)` (not `pg_stat_user_tables.n_live_tup`) because `n_live_tup` is a
 * statistics ESTIMATE maintained by autovacuum/ANALYZE: it can change between
 * two reads with no data change whatsoever, which would make the
 * data-unchanged assertion both flaky and worthless as evidence.
 */
const CENSUS_SQL = `
SELECT c.relname AS table_name,
       (xpath('/row/cnt/text()',
              query_to_xml(format('SELECT count(*) AS cnt FROM public.%I', c.relname),
                           false, true, '')))[1]::text::bigint AS row_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relname;
`

/**
 * A stable, comparable census string: one `table=count` line per table. String
 * form so the before/after comparison is a literal byte comparison and a
 * mismatch prints readably.
 */
async function censusOf(exec: SqlExecutor): Promise<{ text: string; tables: number }> {
  const rows = await exec<CensusRow>(CENSUS_SQL)
  const lines = rows
    .map((row) => `${row.table_name}=${String(row.row_count)}`)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  return { tables: rows.length, text: lines.join('\n') }
}

// ─────────────────────────────────────────────────────────
// Suite state.
// ─────────────────────────────────────────────────────────

/** Fork used only to materialize the Drizzle CODE and read canonical off it. */
let canonicalForkId: BranchId | null = null
/** Fork that is AUDITED. Seeded before the snapshots, untouched between them. */
let auditedForkId: BranchId | null = null

let canonical: CanonicalFingerprint
/** Seed statements applied to the audited fork BEFORE the before-snapshot. */
let seedStatements: string[] = []

/** Observable state BEFORE the audit. */
let beforeFingerprint: { hash: string; fingerprint: SchemaFingerprint }
let beforeSerialized: string
let beforeCensus: { text: string; tables: number }

/** Observable state AFTER the audit. */
let afterFingerprint: { hash: string; fingerprint: SchemaFingerprint }
let afterSerialized: string
let afterCensus: { text: string; tables: number }

/** Statement-level evidence. */
let capturedStatements: string[] = []
let auditReport: AuditReport
let derivedChecks: DataPreCheck[] = []
let preCheckResults: PreCheckResult[] = []

describe.skipIf(!LIVE)('read-only drift audit on a live Neon fork (Property 8)', () => {
  beforeAll(async () => {
    // ── 1. Canonical_Fingerprint from the Drizzle CODE (Req 1.1, 1.2), on its
    //    own disposable fork whose `public` schema is emptied first.
    const canonicalFork = await forkProd('canonical')
    canonicalForkId = canonicalFork.branchId
    expect(REAL_BRANCH_IDS.has(canonicalFork.branchId)).toBe(false)
    canonical = await canonicalOnFork(canonicalFork)

    // ── 2. A second fork of `prod` is the AUDIT TARGET. `prod` is only the
    //    fork parent; no real branch is ever written to.
    const fork = await forkProd('audited')
    auditedForkId = fork.branchId
    expect(REAL_BRANCH_IDS.has(fork.branchId)).toBe(false)

    // ── 3. Seed divergences so the derived pre-check set is non-empty.
    //    STRICTLY BEFORE the before-snapshot, so the audit's unchanged-state
    //    proof spans no seeding at all.
    const seeds: string[] = [
      `ALTER TABLE ${quoteIdent(SEED_NULLABLE.table)} ALTER COLUMN ${quoteIdent(SEED_NULLABLE.column)} DROP NOT NULL;`,
    ]

    const uniqueName = await findConstraintName(
      fork.exec,
      SEED_UNIQUE.table,
      'u',
      SEED_UNIQUE.columns,
    )
    expect(uniqueName, `unique constraint on ${SEED_UNIQUE.table}`).not.toBe(null)
    seeds.push(
      `ALTER TABLE ${quoteIdent(SEED_UNIQUE.table)} DROP CONSTRAINT ${quoteIdent(uniqueName as string)};`,
    )

    for (const fk of SEED_FOREIGN_KEYS) {
      const name = await findConstraintName(fork.exec, fk.table, 'f', fk.columns)
      expect(name, `foreign key ${fk.table}(${fk.columns.join(',')})`).not.toBe(null)
      seeds.push(
        `ALTER TABLE ${quoteIdent(fk.table)} DROP CONSTRAINT ${quoteIdent(name as string)};`,
      )
    }

    for (const statement of seeds) {
      await fork.exec(statement)
    }
    seedStatements = seeds

    // ── 4. BEFORE snapshot: schema (fingerprint bytes + hash) AND data (exact
    //    per-table row census). Taken on the RAW executor so these reads are
    //    not counted as audit-path statements.
    beforeFingerprint = await fingerprintOf(fork.exec)
    beforeSerialized = Fingerprinter.serialize(beforeFingerprint.fingerprint)
    beforeCensus = await censusOf(fork.exec)

    // ── 5. THE AUDIT, entirely through a recording proxy.
    const recorder = recordingExecutor(fork.exec)

    //    5a. Fingerprint read via the REAL orchestration path. `readerFactory`
    //        is injected so the reader is built over the recording proxy; it
    //        still points at the same fork. `runner.audit` reactivates the
    //        branch first — idempotent, and the branch here is our own fork.
    const runner = createDriftRunner({
      neonAdmin: neonAdmin(),
      readerFactory: () => createCatalogReader(recorder.exec),
    })
    auditReport = await runner.audit([fork.branchId])

    //    5b. Data pre-checks derived from a real diff, evaluated on the fork.
    const diff = SchemaDiffer.diff(canonical.fingerprint, beforeFingerprint.fingerprint)
    derivedChecks = PreChecker.plan(diff)
    const probeReader: ProbeReader = { query: (sql) => recorder.exec(sql) }
    preCheckResults = []
    for (const check of derivedChecks) {
      preCheckResults.push(await PreChecker.evaluate(check, probeReader))
    }

    capturedStatements = [...recorder.statements]

    // ── 6. AFTER snapshot, again on the RAW executor.
    afterFingerprint = await fingerprintOf(fork.exec)
    afterSerialized = Fingerprinter.serialize(afterFingerprint.fingerprint)
    afterCensus = await censusOf(fork.exec)
  }, SETUP_TIMEOUT_MS)

  afterAll(async () => {
    // Belt and braces: the cleanup test below deletes these, but this hook runs
    // even when an assertion or the setup fails.
    await deleteFork(canonicalForkId)
    await deleteFork(auditedForkId)
    canonicalForkId = null
    auditedForkId = null
  }, CLEANUP_TIMEOUT_MS)

  it('seeds the disposable fork only, never a real branch', () => {
    // Every seed statement is an ALTER on the fork; none targets a real branch.
    expect(seedStatements.length).toBe(2 + SEED_FOREIGN_KEYS.length)
    for (const statement of seedStatements) {
      expect(statement).toMatch(
        /^ALTER TABLE ".+" (ALTER COLUMN ".+" DROP NOT NULL|DROP CONSTRAINT ".+");$/,
      )
    }
    expect(REAL_BRANCH_IDS.has(auditedForkId as BranchId)).toBe(false)
    expect(REAL_BRANCH_IDS.has(canonicalForkId as BranchId)).toBe(false)
  })

  it('derives a realistic, non-empty pre-check set covering all three kinds', () => {
    expect(derivedChecks.length).toBe(EXPECTED_PRE_CHECKS)
    for (const [kind, count] of Object.entries(EXPECTED_CHECK_COUNTS)) {
      expect(
        derivedChecks.filter((check) => check.kind === kind).length,
        `expected ${count} ${kind} pre-check(s)`,
      ).toBe(count)
    }
    // Every probe actually ran and returned a verdict, so the statement-level
    // proof below covers real executions rather than unevaluated SQL strings.
    expect(preCheckResults.length).toBe(derivedChecks.length)
    for (const result of preCheckResults) {
      expect(result.passed, `${result.check.kind}: ${result.check.description}`).toBe(true)
      expect(result.violationCount).toBe(0)
    }
  })

  it('audits the fork successfully through the real runner path', () => {
    expect(auditReport.failures).toEqual([])
    expect(auditReport.branches.length).toBe(1)
    const audited = auditReport.branches[0]
    expect(audited).toBeDefined()
    expect('hash' in (audited as object)).toBe(true)
    // The audit sees exactly the pre-audit schema — it did not change it.
    expect((audited as { hash: string }).hash).toBe(beforeFingerprint.hash)
  })

  // ── LINE OF EVIDENCE 1: statement-level proof.

  it('issues only read-only SELECT statements across the whole audit path', () => {
    // EXACTLY seven catalog reads plus one probe per derived pre-check — 12.
    // Nothing else reached the database through the audit path.
    expect(capturedStatements.length).toBe(CATALOG_QUERY_COUNT + EXPECTED_PRE_CHECKS)
    expect(capturedStatements.length).toBe(CATALOG_QUERY_COUNT + derivedChecks.length)

    for (const statement of capturedStatements) {
      const leading = leadingKeyword(statement)
      expect(
        leading === 'SELECT' || leading === 'WITH',
        `statement does not lead with SELECT/WITH: ${statement}`,
      ).toBe(true)
      expect(
        writeKeywordsIn(statement),
        `write/DDL keyword found in audit statement: ${statement}`,
      ).toEqual([])
      expect(isReadOnlyStatement(statement)).toBe(true)
    }
  })

  it('flags real write statements (negative control) and not lookalike identifiers', () => {
    // NEGATIVE CONTROL. These strings are NEVER executed — they are fed to the
    // matcher only, to prove it would catch a genuine write. Without this, an
    // over-permissive matcher would make the assertion above pass vacuously.
    const writes: ReadonlyArray<readonly [(typeof WRITE_KEYWORDS)[number], string]> = [
      ['INSERT', `INSERT INTO "business_hour" ("id") VALUES ('x');`],
      ['UPDATE', `UPDATE "business_hour" SET "is_open" = false;`],
      ['DELETE', `DELETE FROM "business_hour" WHERE "id" = 'x';`],
      ['TRUNCATE', `TRUNCATE TABLE "business_hour";`],
      ['MERGE', `MERGE INTO "business_hour" AS t USING "holiday" AS s ON false;`],
      ['CREATE', `CREATE TABLE "zz_tmp" ("id" text);`],
      ['ALTER', `ALTER TABLE "business_hour" ADD COLUMN "zz" text;`],
      ['DROP', `DROP INDEX "zz_idx";`],
      ['GRANT', `GRANT SELECT ON "business_hour" TO "neondb_owner";`],
      ['REVOKE', `REVOKE SELECT ON "business_hour" FROM "neondb_owner";`],
      ['COMMENT', `COMMENT ON TABLE "business_hour" IS 'x';`],
      ['REFRESH', `REFRESH MATERIALIZED VIEW "zz_mv";`],
      ['SET', `SET search_path TO public;`],
      ['COPY', `COPY "business_hour" TO STDOUT;`],
      ['CALL', `CALL zz_procedure();`],
      ['DO', `DO $$ BEGIN END $$;`],
      ['LOCK', `LOCK TABLE "business_hour";`],
      ['VACUUM', `VACUUM "business_hour";`],
      ['REINDEX', `REINDEX TABLE "business_hour";`],
      ['CLUSTER', `CLUSTER "business_hour" USING "business_hour_pkey";`],
    ]

    // Every keyword in the guarded set has a control case.
    expect(new Set(writes.map(([keyword]) => keyword)).size).toBe(WRITE_KEYWORDS.length)

    for (const [keyword, statement] of writes) {
      expect(writeKeywordsIn(statement), `matcher missed ${keyword} in: ${statement}`).toContain(
        keyword,
      )
      expect(isReadOnlyStatement(statement), `matcher accepted a write: ${statement}`).toBe(false)
    }

    // FALSE-POSITIVE GUARD: identifiers that merely CONTAIN a keyword, and a
    // read-only CTE, must all pass.
    const reads = [
      `SELECT "id", "created_at", "updated_at", "deleted_at" FROM "audit_log" WHERE "updated_at" IS NULL;`,
      `SELECT "dropoff_at", "alteration_note", "setting_key", "insertion_id", "docket", "callback_url" FROM "zz";`,
      `WITH recent AS (SELECT "id" FROM "audit_log" LIMIT 10) SELECT count(*) AS cnt FROM recent;`,
    ]
    for (const statement of reads) {
      expect(writeKeywordsIn(statement), `false positive on: ${statement}`).toEqual([])
      expect(isReadOnlyStatement(statement)).toBe(true)
    }
  })

  // ── LINE OF EVIDENCE 2: observable-state proof.

  it(
    'leaves the audited fork schema and data byte-identical (Req 2.2)',
    () => {
      // SCHEMA unchanged — serialized fingerprint bytes AND hash.
      expect(afterSerialized).toBe(beforeSerialized)
      expect(afterFingerprint.hash).toBe(beforeFingerprint.hash)

      // DATA unchanged — exact per-table row census over every `public` table.
      expect(afterCensus.text).toBe(beforeCensus.text)
      expect(afterCensus.tables).toBe(beforeCensus.tables)

      // The census is non-vacuous: it covers every table the fingerprint saw.
      expect(beforeCensus.tables).toBe(beforeFingerprint.fingerprint.tables.length)
      expect(beforeCensus.tables).toBeGreaterThan(0)

      // Evidence summary. Hashes and row counts only — no connection string and
      // no API key is ever printed.
      console.info(
        [
          `[Property 8] captured statements : ${capturedStatements.length} (all read-only)`,
          `[Property 8] pre-checks evaluated: ${derivedChecks.length}`,
          `[Property 8] fingerprint before  : ${beforeFingerprint.hash}`,
          `[Property 8] fingerprint after   : ${afterFingerprint.hash}`,
          `[Property 8] census tables       : ${beforeCensus.tables}`,
          `[Property 8] census before/after : ${beforeCensus.text.replace(/\n/g, ' ')} || ${afterCensus.text.replace(/\n/g, ' ')}`,
        ].join('\n'),
      )
    },
    TEST_TIMEOUT_MS,
  )

  it(
    'leaves no orphaned throwaway branch behind',
    async () => {
      expect(await deleteFork(canonicalForkId)).toBe(null)
      canonicalForkId = null
      expect(await deleteFork(auditedForkId)).toBe(null)
      auditedForkId = null

      const surviving = await survivingThrowawayBranches()
      expect(surviving.map((branch) => branch.name)).toEqual([])
    },
    CLEANUP_TIMEOUT_MS,
  )
})
