/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : GET|POST /api/branches (admin)
 * Scope        : API — Admin branch management
 *
 * Description  : GET lists every branch for the management UI. POST creates a
 *                new branch (code + number generated server-side). Both Owner+.
 *                Multi-branch-ready — no single branch is hardcoded.
 *
 * Responsibilities :
 * - GET: list all branches (Owner+)
 * - POST: create a branch (Owner+), Zod-validated
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/session, @rgss/db/queries,
 *                @rgss/errors, @rgss/types
 *
 * Notes        : Branches are never hard-deleted — status drives lifecycle.
 ************************************************************/

import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'
import { createBranch, getBranches } from '@rgss/db/queries'
import { badRequest } from '@rgss/errors'
import { branchCreateSchema } from '@rgss/types'

// GET /api/branches — list all branches. Owner+.
export const GET = withErrorHandler(async () => {
  await requireRole('owner')
  const branches = await getBranches()
  return apiSuccess({ branches })
})

// POST /api/branches — create a branch. Owner+.
export const POST = withErrorHandler(async (req: Request) => {
  await requireRole('owner')

  const body = await req.json().catch(() => null)
  const parsed = branchCreateSchema.safeParse(body)
  if (!parsed.success) {
    throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
  }

  const created = await createBranch(parsed.data)
  return apiSuccess({ branch: created }, undefined, 201)
})
