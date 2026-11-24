/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 31-10-2026 & Updated - 31-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : POST /api/jobs/settlement-close
 * Scope        : API — Background Jobs (multi-branch R10)
 *
 * Description  : QStash-scheduled job (00:30 IST daily) that closes every
 *                ended IST month not closed yet into cross-branch settlement
 *                statements: one per pair of branches with entries, netted,
 *                and each branch's net position (settlement.md).
 *
 * Responsibilities :
 * - Verify the QStash signature before doing any work
 * - Close the ended months (idempotent: a rerun closes nothing twice)
 * - Ping the SETTLEMENT_CLOSE heartbeat on success
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/jobs/heartbeat, @/lib/jobs/verify, @rgss/db/queries,
 *                @rgss/logger
 *
 * Notes        :
 * - Runs daily so a missed run catches up; most days there is no ended month
 *   to close and nothing changes.
 * - The close waits for entries still being recorded into a month, and only
 *   the transaction that closes a month can make its statements, so QStash's
 *   at-least-once retries are safe.
 ************************************************************/

import { closeSettlementMonths } from '@rgss/db/queries'
import { createLogger } from '@rgss/logger'
import { pingHeartbeat } from '@/lib/jobs/heartbeat'
import { verifyQStashSignature } from '@/lib/jobs/verify'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const logger = createLogger({
  service: 'admin:jobs:settlement-close',
  environment: process.env.NODE_ENV ?? 'development',
})

export const POST = async (req: Request) => {
  const bodyText = await req.text()
  if (!(await verifyQStashSignature(req, bodyText))) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const { months } = await closeSettlementMonths()
    if (months.length > 0) {
      logger.info('[job:settlement-close] closed', { months })
    }
    await pingHeartbeat('SETTLEMENT_CLOSE')
    return Response.json({ success: true, months })
  } catch (error) {
    // Return 500 so QStash retries with backoff; the close is idempotent.
    logger.error('[job:settlement-close] failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return new Response('Job failed', { status: 500 })
  }
}
