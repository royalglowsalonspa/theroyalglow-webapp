/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : POST /api/contact
 * Scope        : API — Public
 *
 * Description  : Unauthenticated contact-form endpoint for the public /contact
 *                page. Rate-limited per IP, strictly Zod-validated, and emails
 *                the enquiry to the salon inbox (best-effort).
 *
 * Responsibilities :
 * - Rate-limit unauthenticated submissions per IP (public write endpoint)
 * - Validate the enquiry payload with contactFormSchema
 * - Normalise an optional Indian phone to E.164 for the salon's convenience
 * - Email the enquiry to the salon inbox, with Reply-To set to the submitter
 *
 * Features / Functionality :
 * - Per-IP rate limiting (mirrors /api/leads)
 * - Best-effort email: never throws if delivery fails — logs and still returns
 *   success, mirroring how /api/bookings and the admin complete route treat
 *   transactional email
 * - HTML-escaped enquiry body (no injection via name/message/email)
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/rate-limit,
 *                @/lib/notifications/providers/email, @rgss/business,
 *                @rgss/errors, @rgss/logger, @rgss/types
 *
 * Notes        :
 * - sendEmail no-ops without RESEND_API_KEY and never throws, so a missing key
 *   (or a Resend outage) can never break this endpoint's success response.
 * - The destination inbox is a constant placeholder until a dedicated env var
 *   is provisioned — see SALON_INBOX_EMAIL TODO below.
 ************************************************************/

import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { enforceRateLimit, getClientIp } from '@/lib/api/rate-limit'
import { sendEmail } from '@/lib/notifications/providers/email'
import { normaliseValidIndianPhone } from '@rgss/business'
import { badRequest } from '@rgss/errors'
import { createLogger } from '@rgss/logger'
import { contactFormSchema } from '@rgss/types'

const logger = createLogger({
  service: 'web:api:contact',
  environment: process.env.NODE_ENV ?? 'development',
})

// TODO: replace with a dedicated env var (e.g. CONTACT_INBOX_EMAIL) once the
// salon's routing inbox is provisioned and added to apps/web/src/env.ts. Until
// then enquiries route to this constant address, which matches the public
// address shown on the /contact page.
const SALON_INBOX_EMAIL = 'hello@theroyalglow.in'

// Escape the five HTML-significant characters so a submitter's name / message /
// email can never break the email markup or inject content. (Same approach as
// packages/business invoicing/email.ts.)
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Build the plain, inline-styled enquiry email the salon receives. Pure string
// builder — all values are escaped above.
function buildEnquiryEmail(input: {
  name: string
  email: string
  phone?: string | undefined
  message: string
}): { subject: string; html: string } {
  const subject = `New contact enquiry from ${input.name}`
  const phoneRow = input.phone
    ? `<p style="margin:4px 0;color:#5b5249;font-size:14px"><strong>Phone:</strong> ${esc(input.phone)}</p>`
    : ''

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#faf7f2;font-family:Helvetica,Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:24px">
    <div style="background:#ffffff;border:1px solid #ece7df;border-radius:12px;padding:28px">
      <h1 style="margin:0 0 12px;color:#1a0f0a;font-size:20px">New contact enquiry</h1>
      <p style="margin:4px 0;color:#5b5249;font-size:14px"><strong>Name:</strong> ${esc(input.name)}</p>
      <p style="margin:4px 0;color:#5b5249;font-size:14px"><strong>Email:</strong> ${esc(input.email)}</p>
      ${phoneRow}
      <div style="margin:16px 0 0;padding:12px 16px;background:#faf7f2;border-radius:8px">
        <p style="margin:0 0 6px;color:#9a9388;font-size:11px;text-transform:uppercase;letter-spacing:.5px">Message</p>
        <p style="margin:0;color:#1a0f0a;font-size:14px;line-height:1.55;white-space:pre-wrap">${esc(input.message)}</p>
      </div>
      <p style="margin:20px 0 0;color:#9a9388;font-size:12px">Reply directly to this email to respond to ${esc(input.name)}.</p>
    </div>
  </div>
</body></html>`

  return { subject, html }
}

// Public, unauthenticated contact enquiry from the /contact page. Rate-limited
// per-IP and strictly Zod-validated (this endpoint is a trust boundary). No PII
// is echoed back — the response is a bare success acknowledgement.
export const POST = withErrorHandler(async (req: Request) => {
  // Per-IP rate-limit guard. Distributed via Upstash when configured, falling
  // back to an in-memory window otherwise (see rate-limit.ts).
  await enforceRateLimit(`contact:${getClientIp(req)}`)

  const body = await req.json().catch(() => null)
  const parsed = contactFormSchema.safeParse(body)
  if (!parsed.success) {
    throw badRequest('Invalid contact form data', parsed.error.flatten().fieldErrors)
  }

  // Normalise the optional phone to +91XXXXXXXXXX when present and valid; the
  // schema already guarantees validity, so this just canonicalises the format.
  const phone = parsed.data.phone
    ? (normaliseValidIndianPhone(parsed.data.phone) ?? parsed.data.phone)
    : undefined

  const { subject, html } = buildEnquiryEmail({
    name: parsed.data.name,
    email: parsed.data.email,
    phone,
    message: parsed.data.message,
  })

  // Best-effort delivery (mirrors /api/bookings + admin complete route):
  // sendEmail never throws and no-ops without RESEND_API_KEY, so a delivery
  // failure can never turn a valid submission into an error for the customer.
  // Reply-To is the submitter so the salon can reply straight from their inbox.
  try {
    const delivered = await sendEmail({
      to: SALON_INBOX_EMAIL,
      subject,
      html,
      replyTo: parsed.data.email,
    })
    if (!delivered) {
      logger.warn('contact enquiry email not delivered (provider unconfigured or failed)', {
        email: parsed.data.email,
      })
    }
  } catch (error) {
    // Defensive: sendEmail already swallows its own errors, but we never let an
    // email problem fail the request.
    logger.error('contact enquiry email threw unexpectedly', {
      error: error instanceof Error ? error.message : String(error),
    })
  }

  return apiSuccess({ received: true }, undefined, 201)
})
