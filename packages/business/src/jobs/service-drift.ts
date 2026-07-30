/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 29-07-2026 & Updated - 29-07-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : service-drift
 * Scope        : Business Logic — Background Jobs
 *
 * Description  : Pure row-diffing logic for the daily service-catalogue drift
 *                reconciliation job. Compares CMS-side snapshots
 *                (`cms.service`, `cms.service_category`) against the
 *                public-side snapshots (`public.service`,
 *                `public.service_category`) and reports divergence.
 *
 * Responsibilities :
 * - Detect rows present in CMS but missing in public
 * - Detect rows present in public but absent from CMS (extra rows)
 * - Detect stale rows (timestamp divergence beyond tolerance)
 * - Detect per-field value divergence on rows present on both sides
 *
 * Features / Functionality :
 * - diffDriftTable(input) — one table's report
 * - buildServiceDriftReport(input) — both tables + roll-up
 * - SERVICE_DRIFT_FIELDS / SERVICE_CATEGORY_DRIFT_FIELDS — compared columns
 * - DRIFT_TIMESTAMP_TOLERANCE_MS — timestamp comparison tolerance
 *
 * Tech Stack   : TypeScript
 * Layer        : Business Logic
 *
 * Dependencies : none
 *
 * Notes        :
 * - PURE: no I/O, no clock reads, no framework deps. The caller supplies both
 *   snapshots and stamps the report with time/duration.
 * - Timestamps are ALWAYS compared with a tolerance, never for exact equality.
 *   Payload's `cms.*` timestamp columns are `timestamp(3)` while `public.*`
 *   keeps microseconds, so the same logical instant can differ by up to ~0.5 ms
 *   purely from precision truncation. Exact equality would report permanent
 *   false drift.
 * - Money arrives as integer paise; comparison is exact integer equality. No
 *   floating-point tolerance is applied to any numeric field.
 * - Detect-only. Nothing here mutates or repairs — the report is for alerting.
 ************************************************************/

// Row-diffing for the drift-reconciliation safety net (Requirement 17).
//
// The `afterChange` hook mirrors every CMS write into `public.*` inside the same
// transaction, so in a healthy system the two sides are identical. This module
// answers one question, deterministically and without I/O: given both sides'
// rows, where do they differ?
//
// Two independent failure modes motivate it:
//   1. a sync hook that silently failed (or ran with SERVICE_SYNC_ENABLED=false)
//      → rows missing from, or stale in, `public.*`
//   2. a direct DB edit against `public.*` bypassing the CMS
//      → extra rows, or field values that no longer match the CMS

/** A value that can appear in a compared column. */
export type DriftFieldValue = string | number | boolean | Date | null

/** One snapshot row. `id` is the shared primary key across both schemas. */
export type DriftRow = {
  readonly id: string
} & Readonly<Record<string, DriftFieldValue | undefined>>

/** The two reconciled table pairs. */
export type DriftTableName = 'service' | 'service_category'

export type DriftFindingKind = 'missing_in_public' | 'extra_in_public' | 'stale' | 'field_mismatch'

/**
 * One divergence. `field`/`cmsValue`/`publicValue` are only present for
 * per-field findings (`stale`, `field_mismatch`). Values are pre-stringified so
 * the finding is JSON-safe for structured logging.
 */
export type DriftFinding = {
  table: DriftTableName
  kind: DriftFindingKind
  id: string
  field?: string
  cmsValue?: string | null
  publicValue?: string | null
}

export type TableDriftReport = {
  table: DriftTableName
  cmsRowCount: number
  publicRowCount: number
  /** ids in `cms.*` with no `public.*` counterpart. */
  missingInPublic: string[]
  /** ids in `public.*` with no `cms.*` counterpart. */
  extraInPublic: string[]
  /** ids whose timestamps diverge beyond tolerance. */
  staleRows: string[]
  /** ids with a non-timestamp field mismatch. */
  changedRows: string[]
  findings: DriftFinding[]
  hasDrift: boolean
}

export type ServiceDriftReport = {
  hasDrift: boolean
  findingCount: number
  toleranceMs: number
  tables: TableDriftReport[]
}

export type DriftSnapshotPair = {
  cmsRows: readonly DriftRow[]
  publicRows: readonly DriftRow[]
}

/**
 * Timestamp comparison tolerance, in milliseconds.
 *
 * Payload stores `cms.*` timestamps at `timestamp(3)` precision; `public.*`
 * keeps microseconds. The same logical instant therefore differs by up to
 * ~0.5 ms from truncation alone. 1 second gives generous headroom for that plus
 * any clock/serialisation jitter, while every real divergence this job exists to
 * catch (a hook that never ran, an out-of-band edit) is orders of magnitude
 * larger.
 */
export const DRIFT_TIMESTAMP_TOLERANCE_MS = 1000

/** Timestamp columns — compared with tolerance, never exact equality. */
export const DRIFT_TIMESTAMP_FIELDS = ['createdAt', 'updatedAt'] as const

/** `public.service` columns the CMS is authoritative for. */
export const SERVICE_DRIFT_FIELDS = [
  'categoryId',
  'name',
  'slug',
  'description',
  'durationMinutes',
  'bufferMinutes',
  'pricePaise',
  'isActive',
  'imageUrl',
  'displayOrder',
  'gemsRedeemable',
  'gemsRequired',
  'gemsCatalogueOrder',
  'createdAt',
  'updatedAt',
] as const

/** `public.service_category` columns the CMS is authoritative for. */
export const SERVICE_CATEGORY_DRIFT_FIELDS = [
  'name',
  'slug',
  'description',
  'serviceType',
  'displayOrder',
  'isActive',
  'createdAt',
  'updatedAt',
] as const

function toMillis(value: DriftFieldValue | undefined): number | null {
  if (value instanceof Date) {
    const ms = value.getTime()
    return Number.isNaN(ms) ? null : ms
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const ms = new Date(value).getTime()
    return Number.isNaN(ms) ? null : ms
  }
  return null
}

function describe(value: DriftFieldValue | undefined): string | null {
  if (value === null || value === undefined) {
    return null
  }
  if (value instanceof Date) {
    return value.toISOString()
  }
  return String(value)
}

// `undefined` (column absent from the snapshot) and `null` (SQL NULL) are the
// same absence for comparison purposes — the mappers coalesce undefined → null
// on the write path, so treating them alike avoids phantom findings.
function isAbsent(value: DriftFieldValue | undefined): boolean {
  return value === null || value === undefined
}

/**
 * Compare one CMS/public table pair.
 *
 * Deterministic: rows are keyed by `id` and every id list is sorted, so the same
 * inputs always produce the same report regardless of row order.
 */
export function diffDriftTable(input: {
  table: DriftTableName
  cmsRows: readonly DriftRow[]
  publicRows: readonly DriftRow[]
  fields: readonly string[]
  timestampFields?: readonly string[]
  toleranceMs?: number
}): TableDriftReport {
  const {
    table,
    cmsRows,
    publicRows,
    fields,
    timestampFields = DRIFT_TIMESTAMP_FIELDS,
    toleranceMs = DRIFT_TIMESTAMP_TOLERANCE_MS,
  } = input

  const publicById = new Map(publicRows.map((row) => [row.id, row]))
  const cmsIds = new Set(cmsRows.map((row) => row.id))
  const timestampSet = new Set(timestampFields)

  const findings: DriftFinding[] = []
  const missingInPublic: string[] = []
  const staleRows = new Set<string>()
  const changedRows = new Set<string>()

  const sortedCmsRows = [...cmsRows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  for (const cmsRow of sortedCmsRows) {
    const publicRow = publicById.get(cmsRow.id)

    if (!publicRow) {
      missingInPublic.push(cmsRow.id)
      findings.push({ table, kind: 'missing_in_public', id: cmsRow.id })
      continue
    }

    for (const field of fields) {
      const cmsValue = cmsRow[field]
      const publicValue = publicRow[field]

      if (timestampSet.has(field)) {
        const cmsMs = toMillis(cmsValue)
        const publicMs = toMillis(publicValue)

        // Both absent → agreed. One absent → real divergence.
        if (cmsMs === null && publicMs === null) {
          continue
        }
        if (cmsMs === null || publicMs === null || Math.abs(cmsMs - publicMs) > toleranceMs) {
          staleRows.add(cmsRow.id)
          findings.push({
            table,
            kind: 'stale',
            id: cmsRow.id,
            field,
            cmsValue: describe(cmsValue),
            publicValue: describe(publicValue),
          })
        }
        continue
      }

      if (isAbsent(cmsValue) && isAbsent(publicValue)) {
        continue
      }
      if (cmsValue !== publicValue) {
        changedRows.add(cmsRow.id)
        findings.push({
          table,
          kind: 'field_mismatch',
          id: cmsRow.id,
          field,
          cmsValue: describe(cmsValue),
          publicValue: describe(publicValue),
        })
      }
    }
  }

  const extraInPublic = publicRows
    .map((row) => row.id)
    .filter((id) => !cmsIds.has(id))
    .sort()

  for (const id of extraInPublic) {
    findings.push({ table, kind: 'extra_in_public', id })
  }

  return {
    table,
    cmsRowCount: cmsRows.length,
    publicRowCount: publicRows.length,
    missingInPublic,
    extraInPublic,
    staleRows: [...staleRows].sort(),
    changedRows: [...changedRows].sort(),
    findings,
    hasDrift: findings.length > 0,
  }
}

/**
 * Build the full reconciliation report for both table pairs.
 *
 * PURE — the caller supplies both snapshots and adds any timing/context to the
 * log envelope. Detect-only: nothing is repaired here (Requirement 17.5).
 */
export function buildServiceDriftReport(input: {
  categories: DriftSnapshotPair
  services: DriftSnapshotPair
  toleranceMs?: number
}): ServiceDriftReport {
  const toleranceMs = input.toleranceMs ?? DRIFT_TIMESTAMP_TOLERANCE_MS

  const tables = [
    diffDriftTable({
      table: 'service_category',
      cmsRows: input.categories.cmsRows,
      publicRows: input.categories.publicRows,
      fields: SERVICE_CATEGORY_DRIFT_FIELDS,
      toleranceMs,
    }),
    diffDriftTable({
      table: 'service',
      cmsRows: input.services.cmsRows,
      publicRows: input.services.publicRows,
      fields: SERVICE_DRIFT_FIELDS,
      toleranceMs,
    }),
  ]

  const findingCount = tables.reduce((sum, t) => sum + t.findings.length, 0)

  return {
    hasDrift: findingCount > 0,
    findingCount,
    toleranceMs,
    tables,
  }
}
