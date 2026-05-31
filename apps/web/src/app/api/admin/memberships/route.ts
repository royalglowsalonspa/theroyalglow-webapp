import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'
import {
  computeExpiry,
  generateInvoiceNumber,
  generateMembershipNumber,
  splitGST,
} from '@rgss/business'
import {
  createMembershipWithInvoice,
  getActiveMembershipForCustomer,
  getBranchByIdAdmin,
  getMemberships,
  getMembershipTiers,
} from '@rgss/db/queries'
import { badRequest, conflict, ERROR_CODES, notFound } from '@rgss/errors'
import { createMembershipSchema } from '@rgss/types'

// The single operational branch (seed: number=1, code="RS"). Memberships and
// their purchase invoices are issued against this branch until multi-branch
// selection lands.
const PRIMARY_BRANCH_ID = 'branch_rayasandra'

export const GET = withErrorHandler(async (req: Request) => {
  await requireRole('receptionist')

  const { searchParams } = new URL(req.url)
  const filters: { tier?: string; status?: string } = {}
  const tier = searchParams.get('tier')
  const status = searchParams.get('status')
  if (tier) {
    filters.tier = tier
  }
  if (status) {
    filters.status = status
  }

  const rows = await getMemberships(filters)
  return apiSuccess(rows)
})

export const POST = withErrorHandler(async (req: Request) => {
  const session = await requireRole('receptionist')

  const body = await req.json().catch(() => null)
  const parsed = createMembershipSchema.safeParse(body)
  if (!parsed.success) {
    throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
  }
  const data = parsed.data

  // One active membership per customer (also DB-enforced via a partial unique
  // index). Pre-check to return a friendly 409 instead of a raw unique violation.
  const active = await getActiveMembershipForCustomer(data.customerId)
  if (active) {
    throw conflict(
      ERROR_CODES.MEMBERSHIP_ALREADY_ACTIVE,
      'This customer already has an active membership',
    )
  }

  // Resolve the selected tier for its name snapshot (active tiers only).
  const tiers = await getMembershipTiers()
  const tier = tiers.find((t) => t.id === data.tierId)
  if (!tier) {
    throw badRequest('Selected membership tier does not exist or is inactive.')
  }

  const branch = await getBranchByIdAdmin(PRIMARY_BRANCH_ID)
  if (!branch) {
    throw notFound('Primary branch not found.')
  }

  const now = new Date()
  const startsAt = new Date(`${data.startDate}T00:00:00.000Z`)
  const expiresAt = computeExpiry(startsAt, data.validityDays)

  // Membership purchase invoice: prices are GST-inclusive paise. Split the base
  // and GST so taxable + GST reconstructs the total exactly. No gems on purchase.
  const { basePaise, gstPaise, totalPaise } = splitGST(data.pricePaise)

  const result = await createMembershipWithInvoice({
    membershipNumber: generateMembershipNumber(branch.number, startsAt),
    customerId: data.customerId,
    tierId: data.tierId,
    tierNameSnapshot: tier.name,
    totalHoursMinutes: data.hoursMinutes,
    pricePaidPaise: data.pricePaise,
    startsAt,
    expiresAt,
    createdBy: session.user.id,
    notes: data.notes ?? null,
    branchId: branch.id,
    invoiceNumber: generateInvoiceNumber(branch.number, now),
    subtotalPaise: basePaise,
    taxableValuePaise: basePaise,
    gstAmountPaise: gstPaise,
    totalAmountPaise: totalPaise,
    paymentMethod: data.paymentMethod,
  })

  return apiSuccess(result, undefined, 201)
})
