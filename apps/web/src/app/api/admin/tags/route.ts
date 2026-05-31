import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'
import { createTag, getAllTags } from '@rgss/db/queries'
import { badRequest } from '@rgss/errors'
import { createTagSchema } from '@rgss/types'

// GET /api/admin/tags — list all customer tags (for the tag picker). Receptionist+.
export const GET = withErrorHandler(async () => {
  await requireRole('receptionist')

  const tags = await getAllTags()
  return apiSuccess({ tags })
})

// POST /api/admin/tags — create a new customer tag. Manager+. The slug is
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
