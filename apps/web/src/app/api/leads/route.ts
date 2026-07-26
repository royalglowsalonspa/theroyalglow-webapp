/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : POST /api/leads
 * Scope        : API — Public
 *
 * Description  : Unauthenticated lead capture endpoint for the /book Meta ad
 *                landing page. Rate-limited per IP, strictly Zod-validated.
 *
 * Responsibilities :
 * - Rate-limit unauthenticated submissions per IP
 * - Validate and normalise lead data (phone to E.164)
 * - Persist lead record with source attribution
 *
 * Features / Functionality :
 * - Per-IP rate limiting (prevents abuse on public endpoint)
 * - Indian phone normalisation (+91 prefix)
 * - Meta ad source attribution (default: meta_ad)
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/rate-limit, @rgss/business,
 *                @rgss/db/queries, @rgss/errors, @rgss/types
 *
 * Notes        :
 * - Only unauthenticated write endpoint in the system.
 * - Extension point for Meta CAPI 'Lead' event in Phase 7.
 ************************************************************/

import { normaliseIndianPhone } from '@rgss/business'
import { createLead } from '@rgss/db/queries'
import { badRequest } from '@rgss/errors'
import { createLeadSchema } from '@rgss/types'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { enforceRateLimit, getClientIp } from '@/lib/api/rate-limit'
import { sendLeadCapiEvent } from '@/lib/meta/capi'

// Public, unauthenticated lead capture from the /book ad-landing page.
// This is the ONLY unauthenticated write endpoint in this phase, so it is
// rate-limited per-IP and strictly Zod-validated. No PII is echoed back beyond
// the created leadId.
export const POST = withErrorHandler(async (req: Request) => {
  // Per-IP rate-limit guard. Distributed via Upstash when configured, falling
  // back to an in-memory window otherwise (see rate-limit.ts).
  await enforceRateLimit(`leads:${getClientIp(req)}`)

  const body = await req.json().catch(() => null)
  const parsed = createLeadSchema.safeParse(body)
  if (!parsed.success) {
    throw badRequest('Invalid lead data', parsed.error.flatten().fieldErrors)
  }

  const phone = normaliseIndianPhone(parsed.data.phone)
  const lead = await createLead({
    ...parsed.data,
    phone,
    source: parsed.data.source ?? 'meta_ad',
  })

  // Fire the Meta CAPI 'Lead' event (best-effort). event_id = lead id so this
  // server-side event deduplicates against the browser Pixel's 'Lead'. The
  // client IP / User-Agent improve match quality; PII is SHA-256 hashed inside
  // the client. This NEVER throws and no-ops without the access token, so it
  // can never break or block the lead-creation response above.
  await sendLeadCapiEvent({
    eventId: lead.id,
    name: parsed.data.name,
    email: parsed.data.email,
    phone,
    clientIpAddress: getClientIp(req),
    clientUserAgent: req.headers.get('user-agent'),
    eventSourceUrl: req.headers.get('referer'),
  })

  return apiSuccess({ leadId: lead.id }, undefined, 201)
})
