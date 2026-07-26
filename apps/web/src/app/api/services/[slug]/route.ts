/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : GET /api/services/[slug]
 * Scope        : API — Public
 *
 * Description  : Returns a single service detail by its URL slug for the
 *                individual service page.
 *
 * Responsibilities :
 * - Resolve service by slug parameter
 * - Return full service detail (pricing, duration, description)
 * - Return 404 for non-existent slugs
 *
 * Features / Functionality :
 * - Slug-based service lookup
 * - Full service metadata (price, duration, category, type)
 * - SEO-friendly URL support
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @rgss/db/queries, @rgss/errors
 *
 * Notes        :
 * - Public/unauthenticated access.
 * - Slug is the URL-friendly service identifier.
 ************************************************************/

import { getServiceBySlug } from '@rgss/db/queries'
import { notFound } from '@rgss/errors'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'

export const GET = withErrorHandler(
  async (_req: Request, ctx: { params: Promise<{ slug: string }> }) => {
    const { slug } = await ctx.params
    const service = await getServiceBySlug(slug)
    if (!service) {
      throw notFound('Service not found.')
    }
    return apiSuccess({ service })
  },
)
