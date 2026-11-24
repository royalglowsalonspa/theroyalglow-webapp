/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 25-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : GET|POST /api/memberships
 * Scope        : API — Admin Membership
 *
 * Description  : Admin membership management. GET lists every membership (they
 *                are shared by all branches) with filters; POST sells a new SPA
 *                membership at the active branch with its purchase invoice.
 *
 * Responsibilities :
 * - Return filtered membership list (tier, status) (GET), showing what each
 *   was sold for only to people who can access its selling branch
 * - Sell a membership (POST): the agreed whole hours and price, independent of
 *   the tier, which is snapshotted; validity from the picked IST start and
 *   expiry dates; the purchase invoice from the selling branch, whose line
 *   names the hours and expiry, never the tier (R9, MS-14–MS-17)
 * - Enforce one-active-membership-per-customer constraint
 * - Schedule membership expired notice job
 *
 * Features / Functionality :
 * - Membership list with tier/status filters
 * - Full membership creation flow (number gen, invoice, expiry)
 * - GST-compliant purchase invoice generation
 * - QStash job scheduling for expiry notice
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/session, @/lib/jobs/enqueue,
 *                @rgss/business, @rgss/db/queries, @rgss/errors, @rgss/types
 *
 * Notes        :
 * - Receptionist or above at the active branch. The sale belongs to the
 *   branch the form was rendered for (multi-branch R2.4, gap 5).
 * - One active membership per customer (DB-enforced partial unique index).
 * - No gems earned on membership purchase or sessions.
 ************************************************************/

import {
  generateMembershipNumber,
  istToday,
  membershipInvoiceLine,
  saleValidity,
} from '@rgss/business'
import {
  createMembershipWithInvoice,
  getActiveMembershipForCustomer,
  getBranchByIdAdmin,
  getMemberships,
  getMembershipTierById,
} from '@rgss/db/queries'
import { badRequest, conflict, ERROR_CODES, notFound } from '@rgss/errors'
import { createMembershipSchema } from '@rgss/types'
import { assertRenderedBranch, requireBranchRole } from '@/lib/api/branch-context'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { invoiceTaxFor } from '@/lib/api/invoice-tax'
import { enqueueJob } from '@/lib/jobs/enqueue'
import { membershipForViewer } from '@/lib/memberships/membership-view'

export const GET = withErrorHandler(async (req: Request) => {
  const ctx = await requireBranchRole('receptionist')

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
  return apiSuccess({
    branchId: ctx.branch.id,
    memberships: rows.map((row) => membershipForViewer(row, ctx.access)),
  })
})

export const POST = withErrorHandler(async (req: Request) => {
  const ctx = await requireBranchRole('receptionist')

  const body = await req.json().catch(() => null)
  const parsed = createMembershipSchema.safeParse(body)
  if (!parsed.success) {
    throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
  }
  assertRenderedBranch(ctx, parsed.data.branchId)
  const data = parsed.data

  // The active branch sells it and issues the purchase invoice. A branch that
  // isn't operational takes no new sales (R1.10).
  const branch = await getBranchByIdAdmin(ctx.branch.id)
  if (!branch) {
    throw notFound('Branch not found.')
  }
  if (branch.status !== 'operational') {
    throw badRequest(`${branch.name} is not selling memberships right now.`)
  }

  // The picked IST dates: start today or later, expiry after the start (MS-16).
  const validity = saleValidity({
    startDate: data.startDate,
    expiresOn: data.expiresOn,
    today: istToday(),
  })

  // One active membership per customer (also DB-enforced via a partial unique
  // index). Pre-check to return a friendly 409 instead of a raw unique violation.
  const active = await getActiveMembershipForCustomer(data.customerId)
  if (active) {
    throw conflict(
      ERROR_CODES.MEMBERSHIP_ALREADY_ACTIVE,
      'This customer already has an active membership',
    )
  }

  // The tier is a starting template: it's snapshotted, and the agreed hours
  // and price stand on their own (R9.3, MS-14).
  const tier = await getMembershipTierById(data.tierId)
  if (!tier?.isActive) {
    throw badRequest('Choose an active membership tier.')
  }

  // The purchase invoice's tax (multi-branch R6.4, TX-11): the agreed price is
  // tax-inclusive and taxed at the selling branch's rate in force now for the
  // tier's SAC code. No gems on purchase. A missing rate is a 409.
  const now = new Date()
  const tax = await invoiceTaxFor({
    branch,
    taxPoint: now,
    lines: [{ grossPaise: data.pricePaise, sacCode: tier.sacCode }],
  })
  const [line] = tax.lines
  if (!line) {
    throw new Error('membership invoice line tax missing')
  }

  const result = await createMembershipWithInvoice({
    membershipNumber: generateMembershipNumber(branch.number, validity.startsAt),
    customerId: data.customerId,
    tierId: tier.id,
    tierNameSnapshot: tier.name,
    tierUsualHoursMinutes: tier.defaultHoursMinutes,
    tierUsualPricePaise: tier.defaultPricePaise,
    totalHoursMinutes: data.hours * 60,
    pricePaidPaise: data.pricePaise,
    startsAt: validity.startsAt,
    expiresAt: validity.expiresAt,
    createdBy: ctx.session.user.id,
    notes: data.notes ?? null,
    branchId: branch.id,
    invoice: {
      paymentMethod: data.paymentMethod,
      subtotalPaise: tax.totals.grossPaise,
      discountAmountPaise: 0,
      taxableValuePaise: tax.totals.taxablePaise,
      gstAmountPaise: tax.totals.taxPaise,
      cgstPaise: tax.totals.cgstPaise,
      sgstPaise: tax.totals.sgstPaise,
      totalAmountPaise: tax.totals.netPaise,
      taxPointAt: tax.taxPointAt,
      financialYear: tax.financialYear,
      taxReviewStatus: tax.taxReviewStatus,
    },
    invoiceLine: {
      // The customer reads hours and expiry, never the tier (R9.1).
      serviceNameSnapshot: membershipInvoiceLine({ hours: data.hours, expiresOn: data.expiresOn }),
      quantity: 1,
      unitPricePaise: data.pricePaise,
      totalPricePaise: line.grossPaise,
      sacCode: line.sacCode,
      taxVersionId: line.taxVersionId,
      rateBps: line.rateBps,
      discountPaise: line.discountPaise,
      taxableValuePaise: line.taxablePaise,
      taxPaise: line.taxPaise,
      cgstPaise: line.cgstPaise,
      sgstPaise: line.sgstPaise,
    },
  })

  const expiresAt = validity.expiresAt

  // Best-effort: schedule the final expiry notice to run +1h after the
  // membership expires. enqueueJob never throws and no-ops without QSTASH_TOKEN,
  // so this can never break membership creation or change its response. Guard
  // the delay so a non-positive value (already-expired edge) is skipped.
  const expiredNoticeDelaySeconds = Math.floor(
    (expiresAt.getTime() + 60 * 60 * 1000 - Date.now()) / 1000,
  )
  if (expiredNoticeDelaySeconds >= 0) {
    await enqueueJob(
      '/api/jobs/membership-expired-notice',
      { membershipId: result.membership.id },
      expiredNoticeDelaySeconds,
    )
  }

  return apiSuccess(result, undefined, 201)
})
