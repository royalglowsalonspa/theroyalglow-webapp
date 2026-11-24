/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-11-2026 & Updated - 21-11-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : offer-drift
 * Scope        : Business Logic — Background Jobs (drift reconciliation)
 *
 * Description  : The offer pair of the daily catalogue drift check
 *                (multi-branch offers.md, R4.7, R7.5): each Payload offer with
 *                a checkout rule against its mirror in `public.offer`, and the
 *                mirror of an offer without one, which must be retired.
 *
 * Responsibilities :
 * - OFFER_DRIFT_FIELDS — the mirror's columns the CMS is authoritative for
 * - diffOfferDrift(snapshot) → the offer table's report
 * - withOfferDrift(report, snapshot) → the catalogue report with offers added
 *
 * Tech Stack   : TypeScript
 * Layer        : Business Logic (pure)
 *
 * Dependencies : ./service-drift
 *
 * Notes        :
 * - Detect only, as for services: nothing is repaired here.
 * - No timestamps are compared: a card-only save moves the CMS row's
 *   `updatedAt` without touching a retired mirror.
 * - Rows are keyed by the mirror id, `cms_offer_<cms id>`. Legacy offers made
 *   in the admin portal (no `cms_id`) are not part of the snapshot.
 ************************************************************/

import {
  type DriftFinding,
  type DriftRow,
  diffDriftTable,
  type ServiceDriftReport,
  type TableDriftReport,
} from './service-drift'

/** `public.offer` columns (plus the linked services) the CMS is authoritative for. */
export const OFFER_DRIFT_FIELDS = [
  'name',
  'description',
  'offerType',
  'discountPercentage',
  'discountAmountPaise',
  'comboPricePaise',
  // IST calendar days, 'YYYY-MM-DD'.
  'startDate',
  'endDate',
  'isActive',
  'terms',
  'displayOrder',
  'showOnWebsite',
  // The sorted, comma-joined linked service ids.
  'serviceIds',
] as const

export type OfferDriftSnapshot = {
  /** CMS offers with a checkout rule, shaped as the sync writes them. */
  ruleRows: readonly DriftRow[]
  /** Mirror ids of the CMS offers without a rule. */
  ruleFreeIds: readonly string[]
  /** The mirrors of CMS offers (`cms_id` set). */
  publicRows: readonly DriftRow[]
}

/**
 * The offer pair: a rule's mirror must match it field for field, and a
 * mirror whose offer has no rule (any more) must be retired. A mirror with no
 * CMS offer at all is extra.
 */
export function diffOfferDrift(snapshot: OfferDriftSnapshot): TableDriftReport {
  const ruleFree = new Set(snapshot.ruleFreeIds)
  const report = diffDriftTable({
    table: 'offer',
    cmsRows: snapshot.ruleRows,
    publicRows: snapshot.publicRows.filter((row) => !ruleFree.has(row.id)),
    fields: OFFER_DRIFT_FIELDS,
    timestampFields: [],
  })

  const stillLive = snapshot.publicRows
    .filter((row) => ruleFree.has(row.id) && row.isActive !== false)
    .map((row) => row.id)
    .sort()
  const findings: DriftFinding[] = [
    ...report.findings,
    ...stillLive.map(
      (id): DriftFinding => ({
        table: 'offer',
        kind: 'field_mismatch',
        id,
        field: 'isActive',
        cmsValue: 'false',
        publicValue: 'true',
      }),
    ),
  ]

  return {
    ...report,
    cmsRowCount: snapshot.ruleRows.length + snapshot.ruleFreeIds.length,
    publicRowCount: snapshot.publicRows.length,
    changedRows: [...new Set([...report.changedRows, ...stillLive])].sort(),
    findings,
    hasDrift: findings.length > 0,
  }
}

/** The catalogue report with the offer pair added (unchanged without a snapshot). */
export function withOfferDrift(
  report: ServiceDriftReport,
  offers: OfferDriftSnapshot | undefined,
): ServiceDriftReport {
  if (!offers) {
    return report
  }
  const tables = [...report.tables, diffOfferDrift(offers)]
  const findingCount = tables.reduce((sum, table) => sum + table.findings.length, 0)
  return { ...report, tables, findingCount, hasDrift: findingCount > 0 }
}
