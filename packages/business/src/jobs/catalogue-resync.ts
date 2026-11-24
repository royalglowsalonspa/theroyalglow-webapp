/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-11-2026 & Updated - 21-11-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : catalogue-resync
 * Scope        : Business Logic — Developer catalogue resync (multi-branch
 *                R4.7, catalogue-resync.md)
 *
 * Description  : Pure helpers around the Developer's resync of Payload's
 *                catalogue into its app mirrors: the drift report grouped by
 *                record, what a resync may repair, the order records are
 *                processed in, and what still differs afterwards.
 *
 * Responsibilities :
 * - groupDriftFindings(report, context) → one entry per drifted record, with
 *   its differences, the CMS revision and whether a resync can repair it
 * - recordNames(rows) → each record's name, CMS first
 * - orderForResync(records) → unique records, categories, services, offers
 * - remainingDifferences(report, table, id) → what a repair left
 *
 * Tech Stack   : TypeScript
 * Layer        : Business Logic (pure)
 *
 * Dependencies : @rgss/types, ./service-drift
 *
 * Notes        : A resync only copies a CMS row into its mirror, so a mirror
 *                without a CMS row is reported and never repaired (nothing is
 *                deleted).
 ************************************************************/

import type { CatalogueResyncRecord, CatalogueSyncTable } from '@rgss/types'
import type { DriftFinding, DriftRow, ServiceDriftReport } from './service-drift'

/** Per table, a value for each mirror id (revisions or names). */
export type ByRecord = Readonly<Record<CatalogueSyncTable, Readonly<Record<string, string>>>>

/** One field that differs, as the drift job reports it. */
export type DriftDifference = {
  field: string
  cmsValue: string | null
  publicValue: string | null
}

/**
 * - `missing`: the CMS row has no mirror;
 * - `extra`: a mirror without a CMS row;
 * - `different`: both exist and some fields differ.
 */
export type DriftRecordKind = 'missing' | 'extra' | 'different'

export type DriftRecord = {
  table: CatalogueSyncTable
  id: string
  name: string | null
  kind: DriftRecordKind
  differences: DriftDifference[]
  /** The CMS row's `updated_at` (ISO, milliseconds); null without a CMS row. */
  cmsUpdatedAt: string | null
  /** True when a resync can repair it, from its CMS row. */
  repairable: boolean
}

/** What became of one record a resync named. */
export type ResyncOutcome =
  | 'created'
  | 'updated'
  | 'retired'
  // A rule-free offer whose mirror was already retired, or never made.
  | 'unchanged'
  // The CMS row changed or went since the report: nothing written.
  | 'changed'
  // A dependency or rule refused it: nothing written.
  | 'refused'
  // An unexpected error: nothing written.
  | 'failed'

const TABLE_ORDER: Readonly<Record<CatalogueSyncTable, number>> = {
  service_category: 0,
  service: 1,
  offer: 2,
}

function keyOf(table: CatalogueSyncTable, id: string): string {
  return `${table}\u0000${id}`
}

function byTableThenId(
  a: { table: CatalogueSyncTable; id: string },
  b: { table: CatalogueSyncTable; id: string },
): number {
  return TABLE_ORDER[a.table] - TABLE_ORDER[b.table] || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

function differencesOf(findings: readonly DriftFinding[]): DriftDifference[] {
  return findings.flatMap((finding) =>
    finding.field === undefined
      ? []
      : [
          {
            field: finding.field,
            cmsValue: finding.cmsValue ?? null,
            publicValue: finding.publicValue ?? null,
          },
        ],
  )
}

function kindOf(findings: readonly DriftFinding[]): DriftRecordKind {
  if (findings.some((finding) => finding.kind === 'missing_in_public')) {
    return 'missing'
  }
  if (findings.some((finding) => finding.kind === 'extra_in_public')) {
    return 'extra'
  }
  return 'different'
}

/**
 * The report's findings, one entry per record: categories first, then
 * services, then offers, each by id. A record is repairable when its CMS row
 * exists (its revision is known) and it isn't an extra mirror.
 */
export function groupDriftFindings(
  report: ServiceDriftReport,
  context: { revisions: ByRecord; names: ByRecord },
): DriftRecord[] {
  const groups = new Map<
    string,
    { table: CatalogueSyncTable; id: string; findings: DriftFinding[] }
  >()
  for (const table of report.tables) {
    for (const finding of table.findings) {
      const key = keyOf(finding.table, finding.id)
      const group = groups.get(key)
      if (group) {
        group.findings.push(finding)
      } else {
        groups.set(key, { table: finding.table, id: finding.id, findings: [finding] })
      }
    }
  }

  return [...groups.values()]
    .map((group): DriftRecord => {
      const kind = kindOf(group.findings)
      const cmsUpdatedAt = context.revisions[group.table][group.id] ?? null
      return {
        table: group.table,
        id: group.id,
        name: context.names[group.table][group.id] ?? null,
        kind,
        differences: differencesOf(group.findings),
        cmsUpdatedAt,
        repairable: kind !== 'extra' && cmsUpdatedAt !== null,
      }
    })
    .sort(byTableThenId)
}

/** Each record's name from the snapshot rows: the CMS row's, else the mirror's. */
export function recordNames(
  rows: Readonly<
    Record<CatalogueSyncTable, { cms: readonly DriftRow[]; mirror: readonly DriftRow[] }>
  >,
): Record<CatalogueSyncTable, Record<string, string>> {
  const names = { service_category: {}, service: {}, offer: {} } as Record<
    CatalogueSyncTable,
    Record<string, string>
  >
  for (const table of Object.keys(TABLE_ORDER) as CatalogueSyncTable[]) {
    const target = names[table]
    // Mirrors first, so a CMS row's name replaces its mirror's.
    for (const row of [...rows[table].mirror, ...rows[table].cms]) {
      if (typeof row.name === 'string' && row.name.length > 0) {
        target[row.id] = row.name
      }
    }
  }
  return names
}

/**
 * The records to resync, each once (the last revision named wins), in an
 * order that writes a service's category before the service.
 */
export function orderForResync(records: readonly CatalogueResyncRecord[]): CatalogueResyncRecord[] {
  const unique = new Map<string, CatalogueResyncRecord>()
  for (const record of records) {
    unique.set(keyOf(record.table, record.id), record)
  }
  return [...unique.values()].sort(byTableThenId)
}

/** What still differs for one record in a fresh report; empty when in sync. */
export function remainingDifferences(
  report: ServiceDriftReport,
  table: CatalogueSyncTable,
  id: string,
): { kind: DriftRecordKind | null; differences: DriftDifference[] } {
  const findings = report.tables
    .flatMap((entry) => entry.findings)
    .filter((finding) => finding.table === table && finding.id === id)
  if (findings.length === 0) {
    return { kind: null, differences: [] }
  }
  return { kind: kindOf(findings), differences: differencesOf(findings) }
}
