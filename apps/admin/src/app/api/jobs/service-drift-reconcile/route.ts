/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 29-07-2026 & Updated - 29-07-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : POST /api/jobs/service-drift-reconcile
 * Scope        : API — Background Jobs
 *
 * Description  : QStash-scheduled job (12:15 AM IST daily) that reconciles the
 *                Payload CMS service catalogue against the public catalogue the
 *                booking engine reads, and alerts on any divergence.
 *
 * Responsibilities :
 * - Verify the QStash signature before doing any work
 * - Read both catalogue snapshots (read-only)
 * - Diff them via the pure @rgss/business differ
 * - Emit an error-level structured log + trip the BetterStack monitor on drift
 *
 * Features / Functionality :
 * - Compares row counts, per-row ids and per-row field values on both pairs
 * - Timestamp comparison uses a tolerance (precision-3 vs microseconds)
 * - Detect + alert only — never repairs (Requirement 17.5)
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/jobs/heartbeat, @/lib/jobs/verify, @rgss/business,
 *                @rgss/db/queries, @rgss/logger
 *
 * Notes        :
 * - QStash scheduled HTTP job, NOT pg_cron. pg_cron was retired because the
 *   free-tier Neon compute scales to zero after ~5 min idle, so a late-night
 *   in-DB schedule would silently never fire. QStash POSTs this endpoint, which
 *   WAKES the compute, so the job runs reliably at ₹0.
 * - ALERTING: the SERVICE_DRIFT heartbeat is pinged ONLY on a clean run. Drift
 *   (or a failed run) withholds the ping, so the BetterStack heartbeat monitor
 *   trips and alerts — the same success-ping contract as the other jobs, used
 *   here to signal "catalogue is in parity".
 * - Drift returns HTTP 200: divergence is a data condition needing a human, not
 *   a transient failure, so a QStash retry would only re-report it. Only a real
 *   job error returns 500 to earn a retry.
 * - Read-only and idempotent, so at-least-once delivery is harmless.
 ************************************************************/

import { buildServiceDriftReport } from '@rgss/business'
import { getServiceDriftSnapshot } from '@rgss/db/queries'
import { createLogger } from '@rgss/logger'
import { pingHeartbeat } from '@/lib/jobs/heartbeat'
import { verifyQStashSignature } from '@/lib/jobs/verify'

// Job 20 — Service Catalogue Drift Reconciliation (QStash scheduled, daily
// 12:15 AM IST). Requirement 17: Payload is the authoring source of truth and an
// afterChange hook mirrors every CMS write into public.service /
// public.service_category inside the same transaction. This job is the safety
// net for the two ways that can still diverge — a hook that silently failed (or
// ran with SERVICE_SYNC_ENABLED=false) and a direct DB edit against public.*.
//
// The comparison itself is pure and lives in @rgss/business; this route only
// orchestrates: verify → read → diff → log/alert.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const logger = createLogger({
  service: 'admin:jobs:service-drift-reconcile',
  environment: process.env.NODE_ENV ?? 'development',
})

export const POST = async (req: Request) => {
  const bodyText = await req.text()
  if (!(await verifyQStashSignature(req, bodyText))) {
    return new Response('Unauthorized', { status: 401 })
  }

  const startedAt = Date.now()

  try {
    const snapshot = await getServiceDriftSnapshot()
    const report = buildServiceDriftReport({
      categories: snapshot.categories,
      services: snapshot.services,
    })
    const durationMs = Date.now() - startedAt

    const summary = {
      durationMs,
      toleranceMs: report.toleranceMs,
      findingCount: report.findingCount,
      tables: report.tables.map((t) => ({
        table: t.table,
        cmsRowCount: t.cmsRowCount,
        publicRowCount: t.publicRowCount,
        missingInPublic: t.missingInPublic,
        extraInPublic: t.extraInPublic,
        staleRows: t.staleRows,
        changedRows: t.changedRows,
      })),
    }

    if (report.hasDrift) {
      // Error-level log (Requirement 17.3) with every finding, and NO heartbeat
      // ping — the withheld ping is what trips the BetterStack monitor. Detect
      // only: a human reviews before anything is mutated (Requirement 17.5).
      logger.error('[job:service-drift-reconcile] CMS ↔ public catalogue drift detected', {
        ...summary,
        findings: report.tables.flatMap((t) => t.findings),
      })
      return Response.json({ success: true, hasDrift: true, report }, { status: 200 })
    }

    logger.info('[job:service-drift-reconcile] catalogue in parity', summary)
    await pingHeartbeat('SERVICE_DRIFT')
    return Response.json({ success: true, hasDrift: false, report })
  } catch (error) {
    // Return 500 so QStash retries with backoff; the job is read-only.
    logger.error('[job:service-drift-reconcile] failed', {
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    })
    return new Response('Job failed', { status: 500 })
  }
}
