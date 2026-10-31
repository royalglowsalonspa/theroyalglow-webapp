/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 25-10-2026 & Updated - 25-10-2026
 *
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : GET|POST /api/tax-versions
 * Scope        : API — Branch tax rates (multi-branch R6.4, TX-01)
 *
 * Description  : The active branch's effective-dated GST rates per SAC code.
 *                GET lists them with the branch's invoice issuer details and
 *                the invoicing mode; POST adds a rate. Developer only,
 *                including through direct API calls.
 *
 * Responsibilities :
 * - GET → { branchId, branchName, issuer, invoicingLive, versions }
 * - POST { branchId, sacCode, rateBps, effectiveFrom, reason } → 201 { version }
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/audit, @/lib/api/branch-context,
 *                @/lib/api/error-handler, @rgss/business, @rgss/db/queries,
 *                @rgss/errors, @rgss/types
 *
 * Notes        : A version starts at 00:00 IST on its date. A branch's first
 *                rate for a SAC code may start on any date; a change starts on
 *                a future date, so it never alters a rate an invoice used.
 *                Versions can't be edited or deleted (0018 trigger); only
 *                their launch review is recorded (PATCH [id]).
 ************************************************************/

import { assertNewTaxVersion, startOfDayIST, taxVersionStates } from '@rgss/business'
import {
  branchHasIssuedInvoices,
  createTaxVersion,
  getBranchByIdAdmin,
  getBranchTaxVersions,
  getInvoicingSetting,
  getTaxVersionsForAdmin,
} from '@rgss/db/queries'
import { badRequest, notFound } from '@rgss/errors'
import { type TaxVersionView, taxVersionCreateSchema } from '@rgss/types'
import { audit } from '@/lib/api/audit'
import { assertRenderedBranch, requireBranchRole } from '@/lib/api/branch-context'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'

export const GET = withErrorHandler(async () => {
  const ctx = await requireBranchRole('developer')

  const [branch, rows, invoicing, prefixFixed] = await Promise.all([
    getBranchByIdAdmin(ctx.branch.id),
    getTaxVersionsForAdmin(ctx.branch.id),
    getInvoicingSetting(),
    branchHasIssuedInvoices(ctx.branch.id),
  ])
  if (!branch) {
    throw notFound('Branch not found.')
  }

  const states = taxVersionStates(
    rows.map((r) => r.version),
    new Date(),
  )
  const versions: TaxVersionView[] = rows.map(
    ({ version, createdByName, reviewedByName, usedByInvoices }) => ({
      id: version.id,
      branchId: version.branchId,
      sacCode: version.sacCode,
      rateBps: version.rateBps,
      effectiveFrom: version.effectiveFrom.toISOString(),
      reviewStatus: version.reviewStatus,
      reason: version.reason,
      createdByName,
      reviewedByName,
      reviewedAt: version.reviewedAt ? version.reviewedAt.toISOString() : null,
      state: states.get(version.id) ?? 'replaced',
      usedByInvoices,
    }),
  )

  return apiSuccess({
    branchId: branch.id,
    branchName: branch.name,
    issuer: {
      legalName: branch.legalName,
      gstin: branch.gstin,
      invoicePrefix: branch.invoicePrefix,
      prefixFixed,
    },
    invoicingLive: invoicing.live,
    versions,
  })
})

export const POST = withErrorHandler(async (req: Request) => {
  const ctx = await requireBranchRole('developer')

  const body = await req.json().catch(() => null)
  const parsed = taxVersionCreateSchema.safeParse(body)
  if (!parsed.success) {
    throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
  }
  assertRenderedBranch(ctx, parsed.data.branchId)
  const data = parsed.data

  const effectiveFrom = startOfDayIST(data.effectiveFrom)
  const existing = (await getBranchTaxVersions(ctx.branch.id)).filter(
    (v) => v.sacCode === data.sacCode,
  )
  assertNewTaxVersion({ effectiveFrom, now: new Date(), existing })

  const version = await createTaxVersion({
    branchId: ctx.branch.id,
    sacCode: data.sacCode,
    rateBps: data.rateBps,
    effectiveFrom,
    reason: data.reason,
    createdBy: ctx.session.user.id,
  })

  await audit(req, ctx.session, {
    action: 'create',
    entityType: 'branch_tax_version',
    entityId: version.id,
    branchId: ctx.branch.id,
    newValues: version,
  })
  return apiSuccess({ version }, undefined, 201)
})
