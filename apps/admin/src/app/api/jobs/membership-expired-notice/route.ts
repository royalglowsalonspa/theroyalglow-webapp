/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : POST /api/jobs/membership-expired-notice
 * Scope        : API — Background Jobs
 *
 * Description  : QStash-triggered job (enqueued +1h after membership expiry)
 *                that sends a final renewal email to the membership owner.
 *
 * Responsibilities :
 * - Parse membershipId from QStash payload
 * - Send renewal email to the membership's customer
 * - Handle missing email/membership gracefully
 *
 * Features / Functionality :
 * - Final post-expiry renewal email
 * - Best-effort delivery (no-op without Resend key)
 * - Payload-driven single-membership processing
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/jobs/heartbeat, @/lib/jobs/verify, @/lib/notifications/providers/email,
 *                @rgss/business, @rgss/db/queries, @rgss/logger
 *
 * Notes        :
 * - Triggered per-membership (not batch); enqueued at membership creation.
 * - Returns 200 even on email no-op to avoid unnecessary retries.
 ************************************************************/

import { pingHeartbeat } from '@/lib/jobs/heartbeat'
import { verifyQStashSignature } from '@/lib/jobs/verify'
import { sendEmail } from '@/lib/notifications/providers/email'
import { buildNotificationContent } from '@rgss/business'
import { getMembershipById } from '@rgss/db/queries'
import { createLogger } from '@rgss/logger'

// Job 19 — Membership expired notice (QStash triggered, enqueued +1h after the
// membership's expiry by membership creation). Sends a final renewal email to
// the owning customer (Requirement 6.4). Best-effort: with no Resend key the
// email no-ops and the job still returns 200.
//
// Route shape (NOT withErrorHandler): read raw body → verify QStash signature
// (401 on fail) → parse payload → DB read + guarded send → heartbeat → 200.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const logger = createLogger({
  service: 'admin:jobs:membership-expired-notice',
  environment: process.env.NODE_ENV ?? 'development',
})

type Payload = { membershipId?: unknown }

export const POST = async (req: Request) => {
  const bodyText = await req.text()

  const verified = await verifyQStashSignature(req, bodyText)
  if (!verified) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const payload = parseBody(bodyText)
    const membershipId = typeof payload.membershipId === 'string' ? payload.membershipId : null

    let sent = false
    if (membershipId) {
      const membership = await getMembershipById(membershipId)
      if (membership?.customerEmail) {
        const { title, body } = buildNotificationContent('membership_expired')
        sent = await sendEmail({
          to: membership.customerEmail,
          subject: title,
          html: `<p>${body}</p>`,
        })
      }
    }

    await pingHeartbeat('MEMBERSHIP_EXPIRED_NOTICE')
    return Response.json({ success: true, sent })
  } catch (error) {
    logger.error('[job:membership-expired-notice]', {
      error: error instanceof Error ? error.message : String(error),
    })
    return new Response('Job failed', { status: 500 })
  }
}

function parseBody(bodyText: string): Payload {
  try {
    return JSON.parse(bodyText) as Payload
  } catch {
    return {}
  }
}
