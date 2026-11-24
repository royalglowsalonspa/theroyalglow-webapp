/************************************************************
 * Module Name  : POST /api/jobs/realtime-revocations
 * Scope        : API — Background Jobs (multi-branch R2.6)
 *
 * Description  : QStash-triggered job that finishes revoking live-update
 *                tokens after role and branch changes. Each change records
 *                its revocations in the same transaction and tries Ably once
 *                straight away; this job makes the confirming call after the
 *                TokenRequest window and retries failed calls.
 *
 * Responsibilities :
 * - Verify the QStash signature before doing any work
 * - Work through every pending revocation (revoke, or close as expired)
 * - Answer 500 when Ably refused, so QStash retries with backoff
 * - Queue itself again for rows still inside the TokenRequest window
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/jobs/enqueue, @/lib/jobs/verify,
 *                @/lib/realtime/revocation, @rgss/logger
 *
 * Notes        : Idempotent: every write touches only pending rows, and
 *                revoking twice is harmless. Rows past the token lifetime are
 *                closed as expired without calling Ably.
 ************************************************************/

import { createLogger } from '@rgss/logger'
import { enqueueJob } from '@/lib/jobs/enqueue'
import { verifyQStashSignature } from '@/lib/jobs/verify'
import { processRealtimeRevocations } from '@/lib/realtime/revocation'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const logger = createLogger({
  service: 'admin:jobs:realtime-revocations',
  environment: process.env.NODE_ENV ?? 'development',
})

export const POST = async (req: Request) => {
  const bodyText = await req.text()
  if (!(await verifyQStashSignature(req, bodyText))) {
    return new Response('Unauthorized', { status: 401 })
  }

  const now = new Date()
  const run = await processRealtimeRevocations({ now })
  logger.info('[job:realtime-revocations] processed pending revocations', run)

  if (run.failed > 0) {
    // QStash retries a 5xx with backoff; the rows stay pending meanwhile.
    return new Response('Some revocations failed', { status: 500 })
  }
  if (run.pending > 0 && run.nextAt) {
    const delay = Math.max(5, Math.ceil((run.nextAt.getTime() - now.getTime()) / 1000) + 5)
    await enqueueJob('/api/jobs/realtime-revocations', {}, delay)
  }
  return Response.json({ success: true, ...run })
}
