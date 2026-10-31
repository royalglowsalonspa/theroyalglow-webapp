/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 31-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : GET|PATCH /api/offers/[id]
 * Scope        : API — Admin Offers
 *
 * Description  : One offer for the read-only Offers page. Offers are edited
 *                in Payload CMS (multi-branch R4.6, offers.md), which syncs
 *                their checkout rules into the app's mirror, so PATCH answers
 *                410 Gone with the CMS link.
 *
 * Responsibilities :
 * - Return a single offer with its linked services (GET)
 * - Refuse edits with 410, pointing at the CMS (PATCH)
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/session, @/lib/cms-links,
 *                @rgss/db/queries, @rgss/errors
 *
 * Notes        :
 * - Requires min role: manager.
 * - Retire an offer in the CMS (untick Active); offers are never deleted.
 ************************************************************/

import { getOfferById } from '@rgss/db/queries'
import { gone, notFound } from '@rgss/errors'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'
import { CMS_OFFERS_URL } from '@/lib/cms-links'

// GET /api/offers/[id] — single offer with its linked services. Manager+.
export const GET = withErrorHandler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    await requireRole('manager')
    const { id } = await ctx.params

    const offer = await getOfferById(id)
    if (!offer) {
      throw notFound('Offer not found.')
    }

    return apiSuccess({ offer })
  },
)

// PATCH /api/offers/[id] — RETIRED. Edit or retire the offer in Payload CMS.
export const PATCH = withErrorHandler(async () => {
  throw gone(`Offers moved to the CMS. Edit or retire offers in Payload CMS at ${CMS_OFFERS_URL}`)
})
