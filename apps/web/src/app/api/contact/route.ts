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
 *                the enquiry to the salon inbox.
 *
 * Responsibilities :
 * - Rate-limit unauthenticated submissions per IP (public write endpoint)
 * - Validate the enquiry payload with contactFormSchema
 * - Normalise an optional Indian phone to E.164 for the salon's convenience
 * - Email the enquiry to the selected branch or main inbox, with Reply-To set to the submitter
 *
 * Features / Functionality :
 * - Per-IP rate limiting (mirrors /api/leads)
 * - Reports a retryable failure if the delivery provider does not accept it
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
 * - A retry with the same optional idempotency key reuses the provider request.
 * - The main inbox is CONTACT_INBOX_EMAIL when provisioned, falling back to
 *   the public company email.
 ************************************************************/

import { normaliseValidIndianPhone } from '@rgss/business'
import { getBranchById } from '@rgss/db/queries'
import { AppError, badRequest, ERROR_CODES } from '@rgss/errors'
import { createLogger } from '@rgss/logger'
import { contactFormSchema } from '@rgss/types'
import { z } from 'zod'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { enforceRateLimit, getClientIp } from '@/lib/api/rate-limit'
import { sendEmail } from '@/lib/notifications/providers/email'
import { BUSINESS } from '@/lib/seo/business'

const logger = createLogger({
  service: 'web:api:contact',
  environment: process.env.NODE_ENV ?? 'development',
})

// Resolve the salon's routing inbox: the optional CONTACT_INBOX_EMAIL env var
// (validated as an email in apps/web/src/env.ts) when present, else the public
// fallback. Read from process.env directly to keep this a graceful optional —
// the var is optional so it must never make the route depend on its presence.
const SALON_INBOX_EMAIL = process.env.CONTACT_INBOX_EMAIL ?? BUSINESS.email
const idempotencyKeySchema = z.uuid()

async function resolveEnquiryBranch(branchId?: string) {
  if (!branchId) return null

  try {
    const branch = await getBranchById(branchId)
    return branch && branch.status !== 'shutdown' ? branch : null
  } catch {
    logger.warn('Contact enquiry branch could not be resolved. Using the main inbox.')
    return null
  }
}

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
  branchName: string | null
}): { subject: string; html: string } {
  const branchLabel = input.branchName ? ` · ${input.branchName}` : ''
  const subject = `New contact enquiry from ${input.name}${branchLabel}`
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
  // Anonymous rate-limit guard. All callers share `unknown` until the SST
  // topology supplies a protected, non-spoofable viewer identity. Distributed
  // via Upstash when configured, with in-memory fallback (see rate-limit.ts).
  await enforceRateLimit(`contact:${getClientIp(req)}`)

  const body = await req.json().catch(() => null)
  const parsed = contactFormSchema.safeParse(body)
  if (!parsed.success) {
    throw badRequest('Invalid contact form data', parsed.error.flatten().fieldErrors)
  }
  const keyHeader = req.headers.get('Idempotency-Key')
  const key = keyHeader === null ? null : idempotencyKeySchema.safeParse(keyHeader)
  if (key?.success === false) throw badRequest('Invalid request idempotency key.')

  // Normalise the optional phone to +91XXXXXXXXXX when present and valid; the
  // schema already guarantees validity, so this just canonicalises the format.
  const phone = parsed.data.phone
    ? (normaliseValidIndianPhone(parsed.data.phone) ?? parsed.data.phone)
    : undefined

  const branch = await resolveEnquiryBranch(parsed.data.branchId)
  const { subject, html } = buildEnquiryEmail({
    name: parsed.data.name,
    email: parsed.data.email,
    phone,
    message: parsed.data.message,
    branchName: branch?.name ?? null,
  })

  // Email is the enquiry's only destination. A refused email leaves nothing
  // for the salon to answer, so the caller must be able to retry.
  let delivered = false
  try {
    const email = {
      to: branch?.email || SALON_INBOX_EMAIL,
      subject,
      html,
      replyTo: parsed.data.email,
    }
    delivered = key?.success
      ? await sendEmail(email, `contact/${key.data}`)
      : await sendEmail(email)
  } catch {
    logger.error('contact enquiry email threw unexpectedly')
  }
  if (!delivered) {
    throw new AppError({
      code: ERROR_CODES.SERVICE_UNAVAILABLE,
      message: 'We could not send your message right now. Please try again or call us directly.',
      statusCode: 503,
      retryable: true,
    })
  }

  return apiSuccess({ received: true }, undefined, 201)
})
