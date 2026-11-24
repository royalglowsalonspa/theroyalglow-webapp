/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 31-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : GET|POST /api/offers
 * Scope        : API — Admin Offers
 *
 * Description  : Every offer for the read-only Offers page (newest first).
 *                Offers are created in Payload CMS (multi-branch R4.6,
 *                offers.md), which syncs their checkout rules into the app's
 *                mirror, so POST answers 410 Gone with the CMS link.
 *
 * Responsibilities :
 * - Return all offers with linked services for admin view (GET)
 * - Refuse creation with 410, pointing at the CMS (POST)
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/session, @/lib/cms-links,
 *                @rgss/db/queries, @rgss/errors
 *
 * Notes        :
 * - Requires min role: manager.
 * - Rows without `cmsId` are test offers made here before the move; they
 *   aren't migrated (R4.8).
 ************************************************************/

import { getAllOffersAdmin } from '@rgss/db/queries'
import { gone } from '@rgss/errors'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'
import { CMS_OFFERS_URL } from '@/lib/cms-links'

// GET /api/offers — all offers (admin view), newest first, each with its
// linked services. Manager+.
export const GET = withErrorHandler(async () => {
  await requireRole('manager')

  const offers = await getAllOffersAdmin()
  return apiSuccess({ offers })
})

// POST /api/offers — RETIRED. Create offers in Payload CMS.
export const POST = withErrorHandler(async () => {
  throw gone(`Offers moved to the CMS. Create offers in Payload CMS at ${CMS_OFFERS_URL}`)
})
