/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : GET|POST /api/tags
 * Scope        : API — Admin CRM
 *
 * Description  : Admin customer tag management. GET lists all tags; POST
 *                creates a new tag (slug auto-derived from name).
 *
 * Responsibilities :
 * - Return all customer tags for the tag picker (GET)
 * - Create new customer tags with optional colour (POST)
 * - Auto-derive URL-safe slug from tag name
 *
 * Features / Functionality :
 * - Full tag catalogue for CRM tag picker
 * - Tag creation with optional colour customisation
 * - Slug auto-generation in the query layer
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/session, @rgss/db/queries,
 *                @rgss/errors, @rgss/types
 *
 * Notes        :
 * - GET requires min role: receptionist; POST requires min role: manager.
 * - Tags are shared across all customers (not per-branch).
 ************************************************************/

import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'
import { createTag, getAllTags } from '@rgss/db/queries'
import { badRequest } from '@rgss/errors'
import { createTagSchema } from '@rgss/types'

// GET /api/tags — list all customer tags (for the tag picker). Receptionist+.
export const GET = withErrorHandler(async () => {
  await requireRole('receptionist')

  const tags = await getAllTags()
  return apiSuccess({ tags })
})

// POST /api/tags — create a new customer tag. Manager+. The slug is
// derived from the name in the query layer.
export const POST = withErrorHandler(async (req: Request) => {
  await requireRole('manager')

  const body = await req.json().catch(() => null)
  const parsed = createTagSchema.safeParse(body)
  if (!parsed.success) {
    throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
  }

  const tag = await createTag(
    parsed.data.color === undefined
      ? { name: parsed.data.name }
      : { name: parsed.data.name, color: parsed.data.color },
  )
  return apiSuccess({ tag }, undefined, 201)
})
