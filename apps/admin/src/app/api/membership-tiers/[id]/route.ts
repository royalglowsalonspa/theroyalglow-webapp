/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 25-10-2026 & Updated - 25-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : PATCH /api/membership-tiers/[id]
 * Scope        : API — Membership tiers (multi-branch R9.4)
 *
 * Description  : Edits a tier template: name, usual hours, usual price, usual
 *                validity, active state and order, and (Developer only) its
 *                tax classification. Later sales use the new values; every
 *                existing membership keeps its own hours, price, expiry and
 *                tier snapshot (MS-17).
 *
 * Responsibilities :
 * - PATCH { name?, usualHours?, usualPricePaise?, usualValidityDays?,
 *   isActive?, displayOrder?, sacCode? } → { tier }
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/audit, @/lib/api/branch-context,
 *                @/lib/api/error-handler, @rgss/business, @rgss/db/queries,
 *                @rgss/errors, @rgss/types
 *
 * Notes        : Receptionist or above at their active branch. A tier is
 *                retired by making it inactive, never deleted: memberships
 *                refer to it.
 ************************************************************/

import { assertTaxClassChange, hasBranchRole } from '@rgss/business'
import {
  getMembershipTierById,
  type MembershipTierValues,
  updateMembershipTier,
} from '@rgss/db/queries'
import { badRequest, notFound } from '@rgss/errors'
import { membershipTierUpdateSchema } from '@rgss/types'
import { audit } from '@/lib/api/audit'
import { requireBranchRole } from '@/lib/api/branch-context'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'

type RouteContext = { params: Promise<{ id: string }> }

export const PATCH = withErrorHandler(async (req: Request, route: RouteContext) => {
  const ctx = await requireBranchRole('receptionist')
  const { id } = await route.params

  const body = await req.json().catch(() => null)
  const parsed = membershipTierUpdateSchema.safeParse(body)
  if (!parsed.success) {
    throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
  }
  const data = parsed.data

  const existing = await getMembershipTierById(id)
  if (!existing) {
    throw notFound('Membership tier not found.')
  }
  assertTaxClassChange({
    isDeveloper: hasBranchRole(ctx.branch, 'developer'),
    current: existing.sacCode,
    next: data.sacCode,
  })

  const patch: Partial<MembershipTierValues> = {}
  if (data.name !== undefined) {
    patch.name = data.name
  }
  if (data.usualHours !== undefined) {
    patch.defaultHoursMinutes = data.usualHours * 60
  }
  if (data.usualPricePaise !== undefined) {
    patch.defaultPricePaise = data.usualPricePaise
  }
  if (data.usualValidityDays !== undefined) {
    patch.defaultValidityDays = data.usualValidityDays
  }
  if (data.isActive !== undefined) {
    patch.isActive = data.isActive
  }
  if (data.displayOrder !== undefined) {
    patch.displayOrder = data.displayOrder
  }
  if (data.sacCode !== undefined) {
    patch.sacCode = data.sacCode
  }

  const tier = await updateMembershipTier(id, patch)
  if (!tier) {
    throw notFound('Membership tier not found.')
  }
  await audit(req, ctx.session, {
    action: 'update',
    entityType: 'spa_membership_tier',
    entityId: id,
    branchId: ctx.branch.id,
    oldValues: existing,
    newValues: patch,
  })
  return apiSuccess({ tier })
})
