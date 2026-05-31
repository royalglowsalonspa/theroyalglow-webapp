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
