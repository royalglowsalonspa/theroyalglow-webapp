/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 31-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : GET|POST /api/membership-tiers
 * Scope        : API — Membership tiers (multi-branch R9.4)
 *
 * Description  : Tiers are starting templates for a sale, shared by every
 *                branch and never shown to customers. GET lists them for the
 *                tiers screen, the sale form and the list filter; POST adds one.
 *
 * Responsibilities :
 * - GET → { tiers, canEditTax }: every tier, active or not, in display order
 * - POST { name, usualHours, usualPricePaise, usualValidityDays, isActive?,
 *   displayOrder?, sacCode? } → 201 { tier }
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/audit, @/lib/api/branch-context,
 *                @/lib/api/error-handler, @rgss/business, @rgss/db/queries,
 *                @rgss/errors, @rgss/types
 *
 * Notes        : Receptionist or above at their active branch, which the audit
 *                entry records. Only the Developer sets the tax classification
 *                (sacCode); everyone else's new tier gets the provisional
 *                membership code. Editing a tier changes later sales only.
 ************************************************************/

import { assertTaxClassChange, hasBranchRole, tierSlug } from '@rgss/business'
import { createMembershipTier, getMembershipTiers } from '@rgss/db/queries'
import { badRequest } from '@rgss/errors'
import { DEFAULT_MEMBERSHIP_SAC_CODE, membershipTierCreateSchema } from '@rgss/types'
import { audit } from '@/lib/api/audit'
import { requireBranchRole } from '@/lib/api/branch-context'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'

export const GET = withErrorHandler(async () => {
  const ctx = await requireBranchRole('receptionist')

  const tiers = await getMembershipTiers({ includeInactive: true })
  return apiSuccess({ tiers, canEditTax: hasBranchRole(ctx.branch, 'developer') })
})

export const POST = withErrorHandler(async (req: Request) => {
  const ctx = await requireBranchRole('receptionist')

  const body = await req.json().catch(() => null)
  const parsed = membershipTierCreateSchema.safeParse(body)
  if (!parsed.success) {
    throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
  }
  const data = parsed.data
  assertTaxClassChange({
    isDeveloper: hasBranchRole(ctx.branch, 'developer'),
    current: null,
    next: data.sacCode,
  })

  // A new tier goes last unless an order is given.
  const existing = await getMembershipTiers({ includeInactive: true })
  const lastOrder = Math.max(0, ...existing.map((t) => t.displayOrder))

  const tier = await createMembershipTier({
    name: data.name,
    slug: tierSlug(data.name),
    defaultHoursMinutes: data.usualHours * 60,
    defaultPricePaise: data.usualPricePaise,
    defaultValidityDays: data.usualValidityDays,
    sacCode: data.sacCode ?? DEFAULT_MEMBERSHIP_SAC_CODE,
    isActive: data.isActive ?? true,
    displayOrder: data.displayOrder ?? lastOrder + 1,
  })

  await audit(req, ctx.session, {
    action: 'create',
    entityType: 'spa_membership_tier',
    entityId: tier.id,
    branchId: ctx.branch.id,
    newValues: tier,
  })
  return apiSuccess({ tier }, undefined, 201)
})
