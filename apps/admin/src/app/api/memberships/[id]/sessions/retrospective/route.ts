import { createHash } from 'node:crypto'
import { generateBookingNumber, istToday } from '@rgss/business'
import {
  getBranchByIdAdmin,
  getHistoricalMembershipSessionByKey,
  getMembershipById,
  getServicesByIds,
  getSettlementSetting,
  getStaffNamesByIds,
  recordHistoricalMembershipSession,
} from '@rgss/db/queries'
import { badRequest, conflict, ERROR_CODES, notFound } from '@rgss/errors'
import {
  HISTORICAL_SESSION_LOOKBACK_DAYS,
  HISTORICAL_SESSION_MAX_MINUTES,
  historicalMembershipSessionSchema,
} from '@rgss/types'
import { assertRenderedBranch, requireBranchRole } from '@/lib/api/branch-context'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { invoiceTaxFor, serviceSacCodes } from '@/lib/api/invoice-tax'

export const POST = withErrorHandler(
  async (req: Request, route: { params: Promise<{ id: string }> }) => {
    const ctx = await requireBranchRole('developer')
    const { id } = await route.params
    const parsed = historicalMembershipSessionSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      throw badRequest('Invalid retrospective session', parsed.error.flatten().fieldErrors)
    }
    const input = parsed.data
    assertRenderedBranch(ctx, input.branchId)
    const branchId = ctx.branch.id
    const actualStart = new Date(input.actualStart)
    const actualEnd = new Date(input.actualEnd)
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          ...input,
          actualStart: actualStart.toISOString(),
          actualEnd: actualEnd.toISOString(),
        }),
      )
      .digest('hex')

    async function replay() {
      const prior = await getHistoricalMembershipSessionByKey(id, input.idempotencyKey, branchId)
      if (!prior) return null
      if (prior.fingerprint !== fingerprint) {
        throw conflict(ERROR_CODES.CONFLICT, 'This request key belongs to a different session.')
      }
      const { booking, invoice, remainingMinutes } = prior
      return apiSuccess({ booking, invoice, remainingMinutes, duplicate: true })
    }

    const prior = await replay()
    if (prior) return prior

    const now = new Date()
    const minutes = input.services.reduce((total, service) => total + service.durationMinutes, 0)
    if (
      actualEnd > now ||
      minutes > HISTORICAL_SESSION_MAX_MINUTES ||
      actualEnd.getTime() - actualStart.getTime() !== minutes * 60_000 ||
      actualStart.getTime() < now.getTime() - HISTORICAL_SESSION_LOOKBACK_DAYS * 86_400_000
    ) {
      throw badRequest(
        `Use actual times within the last ${HISTORICAL_SESSION_LOOKBACK_DAYS} days. They must match the service minutes, up to ${HISTORICAL_SESSION_MAX_MINUTES}.`,
      )
    }

    const ids = [...new Set(input.services.map((service) => service.serviceId))]
    const [branch, membership, services, staff] = await Promise.all([
      getBranchByIdAdmin(branchId),
      getMembershipById(id),
      getServicesByIds(ids),
      getStaffNamesByIds([input.staffId]),
    ])
    if (!branch || !membership) throw notFound('Membership or branch not found.')
    if (branch.status !== 'operational') {
      throw conflict(ERROR_CODES.BRANCH_INACTIVE, 'The delivering branch must be operational.')
    }
    if (membership.status === 'cancelled') {
      throw conflict(ERROR_CODES.CONFLICT, 'A cancelled membership requires a financial review.')
    }
    if (actualStart < membership.startsAt || actualStart > membership.expiresAt) {
      throw badRequest('The session must have begun while the membership was valid.')
    }
    if (!staff[0]) throw badRequest('Choose a retained staff profile.')
    if (
      services.length !== ids.length ||
      services.some((service) => service.serviceType !== 'spa')
    ) {
      throw badRequest('Choose existing SPA services.')
    }

    const byId = new Map(services.map((service) => [service.id, service.name]))
    const lines = input.services.map(({ serviceId, durationMinutes }) => ({
      serviceId,
      serviceNameSnapshot: byId.get(serviceId) ?? serviceId,
      staffNameSnapshot: staff[0]?.name ?? null,
      durationMinutes,
    }))
    const [sacCodes, settlement] = await Promise.all([
      serviceSacCodes(
        lines.map((line) => ({ serviceId: line.serviceId, name: line.serviceNameSnapshot })),
      ),
      getSettlementSetting(),
    ])
    // The zero-charge document is issued now. The visit and staff history keep
    // the actual service times and the audit records the eligibility evidence.
    const tax = await invoiceTaxFor({
      branch,
      taxPoint: now,
      lines: lines.map((line) => ({ grossPaise: 0, sacCode: sacCodes.get(line.serviceId) ?? '' })),
    })
    const bookingDay = new Date(`${istToday(actualStart)}T00:00:00.000Z`)
    const result = await recordHistoricalMembershipSession({
      ...input,
      branchId,
      membershipId: id,
      customerId: membership.customerId,
      changedById: ctx.session.user.id,
      bookingNumber: generateBookingNumber(branch.code, 'spa', bookingDay, true),
      actualStart,
      actualEnd,
      requestFingerprint: fingerprint,
      lines,
      settlement,
      invoice: {
        taxPointAt: tax.taxPointAt,
        financialYear: tax.financialYear,
        taxReviewStatus: tax.taxReviewStatus,
        lineTax: tax.lines.map(({ sacCode, taxVersionId, rateBps }) => ({
          sacCode,
          taxVersionId,
          rateBps,
        })),
      },
    })
    if (!result.ok) {
      const retry = await replay()
      if (retry) return retry
      if (result.reason === 'staff') {
        throw conflict(
          ERROR_CODES.STAFF_BUSY,
          'The session conflicts with the staff member’s work history.',
        )
      }
      throw conflict(
        ERROR_CODES.CONFLICT,
        'This session overlaps an existing session, or the branch or membership can no longer accept it.',
      )
    }

    const { booking, invoice, remainingMinutes } = result
    return apiSuccess({ booking, invoice, remainingMinutes, duplicate: false }, undefined, 201)
  },
)
