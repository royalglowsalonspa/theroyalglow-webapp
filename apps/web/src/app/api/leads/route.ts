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

import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { enforceRateLimit, getClientIp } from '@/lib/api/rate-limit'
import { normaliseIndianPhone } from '@rgss/business'
import { createLead } from '@rgss/db/queries'
import { badRequest } from '@rgss/errors'
import { createLeadSchema } from '@rgss/types'

// Public, unauthenticated lead capture from the /book ad-landing page.
// This is the ONLY unauthenticated write endpoint in this phase, so it is
// rate-limited per-IP and strictly Zod-validated. No PII is echoed back beyond
// the created leadId.
export const POST = withErrorHandler(async (req: Request) => {
  // Per-IP rate-limit guard. In-memory best-effort today; see rate-limit.ts for
  // the Upstash wiring TODO.
  enforceRateLimit(`leads:${getClientIp(req)}`)

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

  // Extension point (Phase 7): fire Meta CAPI 'Lead' event here.

  return apiSuccess({ leadId: lead.id }, undefined, 201)
})
