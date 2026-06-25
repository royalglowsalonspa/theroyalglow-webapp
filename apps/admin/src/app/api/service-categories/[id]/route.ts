/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : PATCH /api/service-categories/[id]
 * Scope        : API — Admin service category management
 *
 * Description  : Updates a category (rename, reorder, change type, or
 *                activate/deactivate). Manager+.
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/session, @rgss/db/queries,
 *                @rgss/errors, @rgss/types
 *
 * Notes        : Categories are never hard-deleted (FK RESTRICT from services);
 *                deactivate instead. Slug stays stable across renames.
 ************************************************************/

import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'
import { getServiceCategoryById, updateServiceCategory } from '@rgss/db/queries'
import { badRequest, notFound } from '@rgss/errors'
import { serviceCategoryUpdateSchema } from '@rgss/types'

export const PATCH = withErrorHandler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    await requireRole('manager')
    const { id } = await ctx.params

    const body = await req.json().catch(() => null)
    const parsed = serviceCategoryUpdateSchema.safeParse(body)
    if (!parsed.success) {
      throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
    }

    const existing = await getServiceCategoryById(id)
    if (!existing) {
      throw notFound('Category not found.')
    }

    const updated = await updateServiceCategory(id, parsed.data)
    return apiSuccess({ category: updated })
  },
)
