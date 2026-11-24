/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-11-2026 & Updated - 21-11-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : GET, POST /api/catalogue-sync
 * Scope        : API — Developer catalogue resync (multi-branch R4.7,
 *                catalogue-resync.md)
 *
 * Description  : The Developer's view of the CMS ↔ app catalogue drift, and
 *                the explicit repair that copies Payload's current rows into
 *                their mirrors. The nightly drift job stays detect-only.
 *
 * Responsibilities :
 * - GET: the drift report, one entry per record, with its differences, the
 *   CMS revision and whether a resync can repair it
 * - POST { records }: resync up to 25 records (categories, then services,
 *   then offers), each in its own transaction and only at the revision the
 *   report showed; then a fresh report says what still differs
 * - Audit every attempt with its outcome
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/audit, @/lib/api/error-handler, @/lib/api/session,
 *                @rgss/business, @rgss/db/queries, @rgss/errors, @rgss/logger,
 *                @rgss/types
 *
 * Notes        :
 * - Developer only (`requireRole('developer')`, route policy `developer`).
 * - The only catalogue write the admin portal makes: it copies the CMS row,
 *   never authors values, so Payload stays the source of truth (R4.6).
 * - A record refused for a changed revision (409 CATALOGUE_CHANGED) or a
 *   missing dependency (409) is reported per record; the request succeeds.
 ************************************************************/

import {
  buildServiceDriftReport,
  type DriftDifference,
  type DriftRecordKind,
  groupDriftFindings,
  orderForResync,
  type ResyncOutcome,
  recordNames,
  remainingDifferences,
  withOfferDrift,
} from '@rgss/business'
import { getCmsRevisions, getServiceDriftSnapshot, resyncCatalogueRecord } from '@rgss/db/queries'
import { AppError, badRequest, ERROR_CODES } from '@rgss/errors'
import { createLogger } from '@rgss/logger'
import { type CatalogueResyncRecord, catalogueResyncSchema, MAX_RESYNC_RECORDS } from '@rgss/types'
import { audit } from '@/lib/api/audit'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'

export const dynamic = 'force-dynamic'

const logger = createLogger({
  service: 'admin:catalogue-sync',
  environment: process.env.NODE_ENV ?? 'development',
})

/** The drift report as both sides stand now. */
async function currentReport() {
  const snapshot = await getServiceDriftSnapshot()
  const report = withOfferDrift(
    buildServiceDriftReport({ categories: snapshot.categories, services: snapshot.services }),
    snapshot.offers,
  )
  const names = recordNames({
    service_category: { cms: snapshot.categories.cmsRows, mirror: snapshot.categories.publicRows },
    service: { cms: snapshot.services.cmsRows, mirror: snapshot.services.publicRows },
    offer: { cms: snapshot.offers.ruleRows, mirror: snapshot.offers.publicRows },
  })
  return { report, names }
}

export const GET = withErrorHandler(async () => {
  await requireRole('developer')
  const [{ report, names }, revisions] = await Promise.all([currentReport(), getCmsRevisions()])
  return apiSuccess({
    checkedAt: new Date().toISOString(),
    findingCount: report.findingCount,
    records: groupDriftFindings(report, { revisions, names }),
  })
})

type ResyncResult = CatalogueResyncRecord & {
  outcome: ResyncOutcome
  message: string | null
  remaining: { kind: DriftRecordKind | null; differences: DriftDifference[] }
}

/** One record's resync: what it wrote, or why it wrote nothing. */
async function resyncOne(
  record: CatalogueResyncRecord,
): Promise<{ outcome: ResyncOutcome; message: string | null }> {
  try {
    return { outcome: await resyncCatalogueRecord(record), message: null }
  } catch (error) {
    if (error instanceof AppError && error.code === ERROR_CODES.CATALOGUE_CHANGED) {
      return { outcome: 'changed', message: error.message }
    }
    if (error instanceof AppError && error.statusCode === 409) {
      return { outcome: 'refused', message: error.message }
    }
    logger.error('[catalogue-sync] resync failed', {
      table: record.table,
      id: record.id,
      error: error instanceof Error ? error.message : String(error),
    })
    return { outcome: 'failed', message: 'The resync failed unexpectedly; nothing was written.' }
  }
}

export const POST = withErrorHandler(async (req: Request) => {
  const session = await requireRole('developer')
  const parsed = catalogueResyncSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    throw badRequest(
      `Name between 1 and ${MAX_RESYNC_RECORDS} records to resync, each with its CMS revision.`,
      parsed.error.flatten().fieldErrors,
    )
  }

  // One at a time, in dependency order: each is its own transaction.
  const records = orderForResync(parsed.data.records)
  const attempts: {
    record: CatalogueResyncRecord
    outcome: ResyncOutcome
    message: string | null
  }[] = []
  for (const record of records) {
    attempts.push({ record, ...(await resyncOne(record)) })
  }

  // Parity: what each record still differs in, from a fresh read.
  const { report } = await currentReport()
  const results: ResyncResult[] = attempts.map(({ record, outcome, message }) => ({
    ...record,
    outcome,
    message,
    remaining: remainingDifferences(report, record.table, record.id),
  }))

  for (const result of results) {
    await audit(req, session, {
      action: 'update',
      entityType: 'catalogue_resync',
      entityId: `${result.table}:${result.id}`,
      oldValues: { cmsUpdatedAt: result.cmsUpdatedAt },
      newValues: { outcome: result.outcome, message: result.message, remaining: result.remaining },
    })
  }
  logger.info('[catalogue-sync] resync', {
    actorId: session.user.id,
    results: results.map((r) => ({ table: r.table, id: r.id, outcome: r.outcome })),
  })

  return apiSuccess({ results, findingCount: report.findingCount })
})
