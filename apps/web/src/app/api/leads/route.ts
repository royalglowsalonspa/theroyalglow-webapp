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
 * - Filed under the branch the ad link named, or the default branch
 *   (multi-branch R7.3)
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/rate-limit, @rgss/business,
 *                @rgss/db/queries, @rgss/errors, @rgss/types
 *
 * Notes        :
 * - Only unauthenticated write endpoint in the system.
 * - Lead contact details stay in the first-party pipeline.
 ************************************************************/

import { normaliseIndianPhone, resolveLeadBranch } from '@rgss/business'
import { createLead, getPublicBranches } from '@rgss/db/queries'
import { badRequest, conflict, ERROR_CODES } from '@rgss/errors'
import { createLeadSchema } from '@rgss/types'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { enforceRateLimit, getClientIp } from '@/lib/api/rate-limit'

// Public, unauthenticated lead capture from the /book ad-landing page.
// This is the ONLY unauthenticated write endpoint in this phase, so it is
// rate-limited per-IP and strictly Zod-validated. No PII is echoed back beyond
// the created leadId.
export const POST = withErrorHandler(async (req: Request) => {
  // Anonymous rate-limit guard. All callers share `unknown` until the SST
  // topology supplies a protected, non-spoofable viewer identity. Distributed
  // via Upstash when configured, with in-memory fallback (see rate-limit.ts).
  await enforceRateLimit(`leads:${getClientIp(req)}`)

  const body = await req.json().catch(() => null)
  const parsed = createLeadSchema.safeParse(body)
  if (!parsed.success) {
    throw badRequest('Invalid lead data', parsed.error.flatten().fieldErrors)
  }

  const { branchId: requestedBranchId, ...fields } = parsed.data
  const phone = normaliseIndianPhone(fields.phone)
  // The branch the ad link named when it is real, else the default branch, so
  // every lead reaches a branch's pipeline (multi-branch R7.3).
  const branch = resolveLeadBranch(await getPublicBranches(), requestedBranchId)
  if (!branch) {
    throw conflict(ERROR_CODES.BRANCH_INACTIVE, 'No branch is accepting enquiries right now.')
  }
  const lead = await createLead({
    ...fields,
    phone,
    source: fields.source ?? 'meta_ad',
    branchId: branch.id,
  })

  // Cookie preferences live in browser storage. This endpoint has no verified
  // marketing opt-in, so it cannot forward the submitter's details to Meta.
  return apiSuccess({ leadId: lead.id }, undefined, 201)
})
