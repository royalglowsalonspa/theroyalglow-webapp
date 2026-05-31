import { getBookingForFollowup } from '@rgss/db/queries'
import { buildNotificationContent } from '@rgss/business'
import { createLogger } from '@rgss/logger'
import { pingHeartbeat } from '@/lib/jobs/heartbeat'
import { sendEmail } from '@/lib/notifications/providers/email'
import { verifyQStashSignature } from '@/lib/jobs/verify'

// Job 16 — Post-service follow-up (QStash triggered, enqueued +24h by booking
// completion). Sends a review-request email to the customer, but ONLY when the
// booking actually completed AND the customer has marketing consent
// (Requirement 6.1). Everything is best-effort: with no Resend key the email
// no-ops and the job still returns 200.
//
// Route shape (NOT withErrorHandler): read raw body → verify QStash signature
// (401 on fail) → parse payload → DB read + guarded send → heartbeat → 200.
// A non-2xx (500) on internal failure lets QStash retry with backoff.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const logger = createLogger({
  service: 'web:jobs:post-service-followup',
  environment: process.env.NODE_ENV ?? 'development',
})

type Payload = { bookingId?: unknown }

export const POST = async (req: Request) => {
  const bodyText = await req.text()

  const verified = await verifyQStashSignature(req, bodyText)
  if (!verified) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const payload = parseBody(bodyText)
    const bookingId =
      typeof payload.bookingId === 'string' ? payload.bookingId : null

    let sent = false
    if (bookingId) {
      const booking = await getBookingForFollowup(bookingId)
      // Only completed bookings with a consenting customer get a review request.
      if (
        booking &&
        booking.status === 'completed' &&
        booking.marketingConsent === true &&
        booking.customerEmail
      ) {
        const { title, body } = buildNotificationContent('post_service_followup', {
          serviceName: booking.serviceType === 'spa' ? 'SPA treatment' : 'salon service',
        })
        sent = await sendEmail({
          to: booking.customerEmail,
          subject: title,
          html: `<p>${body}</p>`,
        })
      }
    }

    await pingHeartbeat('POST_SERVICE_FOLLOWUP')
    return Response.json({ success: true, sent })
  } catch (error) {
    logger.error('[job:post-service-followup]', {
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
