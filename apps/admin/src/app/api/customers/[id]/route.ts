/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 30-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : GET|PATCH /api/customers/[id]
 * Scope        : API — Admin CRM
 *
 * Description  : Admin single customer profile, as the active branch sees it.
 *                GET returns the profile page's projection; PATCH lets a
 *                Manager or above override the no-show gates.
 *
 * Responsibilities :
 * - Return shared identity, tags, gems and memberships, the active branch's
 *   money, bookings and invoices, other branches' visits (date, branch and
 *   services) and the notes the branch may read (GET)
 * - Allow manager+ to override no-show count and approval flag (PATCH)
 * - Validate, persist and audit profile gate overrides
 *
 * Features / Functionality :
 * - One projection with the profile page (loadCustomerDetail)
 * - No-show count reset (PATCH, manager+)
 * - Booking approval requirement toggle (PATCH, manager+)
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/branch-context, @/lib/api/error-handler,
 *                @/lib/customers/customer-detail, @rgss/db/queries,
 *                @rgss/errors, @rgss/types
 *
 * Notes        :
 * - GET requires receptionist at the active branch; PATCH manager there.
 * - Customers are shared (multi-branch R3.1), so any branch may open one;
 *   money stays per branch (R3.2). The no-show gates follow the customer to
 *   every branch; the audit entry records the branch that changed them.
 * - PATCH with no gate fields is a no-op returning the current gates.
 ************************************************************/

import { getCustomerProfile, updateCustomerProfile } from '@rgss/db/queries'
import { badRequest, notFound } from '@rgss/errors'
import { updateCustomerGatesSchema } from '@rgss/types'
import { audit } from '@/lib/api/audit'
import { assertRenderedBranch, requireBranchRole } from '@/lib/api/branch-context'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { loadCustomerDetail } from '@/lib/customers/customer-detail'

// GET /api/customers/[id] — the customer as the active branch sees them.
// Receptionist+.
export const GET = withErrorHandler(
  async (_req: Request, route: { params: Promise<{ id: string }> }) => {
    const ctx = await requireBranchRole('receptionist')
    const { id } = await route.params

    const detail = await loadCustomerDetail(id, ctx.branch.id)
    if (!detail) {
      throw notFound('Customer not found.')
    }

    return apiSuccess(detail)
  },
)

// PATCH /api/customers/[id] — manager+ override of profile gates (e.g.
// reset the no-show count or toggle the booking-approval requirement).
export const PATCH = withErrorHandler(
  async (req: Request, route: { params: Promise<{ id: string }> }) => {
    const ctx = await requireBranchRole('manager')
    const { id } = await route.params

    const body = await req.json().catch(() => null)
    const parsed = updateCustomerGatesSchema.safeParse(body)
    if (!parsed.success) {
      throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
    }
    assertRenderedBranch(ctx, parsed.data.branchId)
    const { branchId: _renderedBranchId, ...patch } = parsed.data

    const before = await getCustomerProfile(id)
    if (!before) {
      throw notFound('Customer not found.')
    }

    const updated = await updateCustomerProfile(id, patch)
    if (!updated) {
      throw notFound('Customer not found.')
    }

    if (patch.noshowCount !== undefined || patch.bookingRequiresApproval !== undefined) {
      await audit(req, ctx.session, {
        action: 'update',
        entityType: 'customer_profile',
        entityId: id,
        branchId: ctx.branch.id,
        oldValues: {
          noshowCount: before.noshowCount,
          bookingRequiresApproval: before.bookingRequiresApproval,
        },
        newValues: patch,
      })
    }

    return apiSuccess({ customer: updated })
  },
)
