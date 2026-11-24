/************************************************************
 * Module Name  : GET /api/branches/owner-candidates
 * Scope        : API — Choosing a new branch's Owner (multi-branch R1.1, R1.2)
 *
 * Description  : Finds existing accounts by name, phone or email for the New
 *                branch form, and says whether each can own a branch: an Owner
 *                already, or a Customer with no active staff profile. Only
 *                name, email and phone are returned.
 *
 * Features / Functionality :
 * - GET ?search= (≥ 3 characters) → { people: [{ id, name, email, phone,
 *   available, reason }] } (≤ 10)
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Notes        : Developer only, like branch creation. The create transaction
 *                checks the same rule again against current rows.
 ************************************************************/

import { searchUsers } from '@rgss/db/queries'
import { badRequest } from '@rgss/errors'
import { userListQuerySchema } from '@rgss/types'
import { requireCurrentRole } from '@/lib/api/branch-context'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'

export const GET = withErrorHandler(async (req: Request) => {
  await requireCurrentRole('developer')

  const params = Object.fromEntries(new URL(req.url).searchParams)
  const parsed = userListQuerySchema.safeParse(params)
  if (!parsed.success) {
    throw badRequest('Invalid query parameters', parsed.error.flatten().fieldErrors)
  }

  const matches = await searchUsers(parsed.data.search ?? '')
  const people = matches.map((match) => {
    const role = match.role ?? 'customer'
    const available = role === 'owner' || (role === 'customer' && match.staff?.isActive !== true)
    return {
      id: match.id,
      name: match.name,
      email: match.email,
      phone: match.phone,
      available,
      reason: available
        ? null
        : role === 'developer'
          ? 'The Developer can’t own a branch.'
          : 'This person holds another role. Remove it first.',
    }
  })
  return apiSuccess({ people })
})
