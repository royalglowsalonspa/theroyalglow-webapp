import { z } from 'zod'
import { INVOICE_ISSUE_EVENT_PATH, invoiceEventIdSchema } from './invoice-issue-event'
import { invoiceReconciliationMonthSchema } from './invoice-reconciliation'

export const INVOICE_BRANCH_SETTLEMENT_PATH = `${INVOICE_ISSUE_EVENT_PATH}/branch-settlement`

const minutes = z.int().nonnegative()
const membershipBalancesSchema = z
  .strictObject({
    activeCount: z.int().nonnegative(),
    purchasedMinutes: minutes,
    usedMinutes: minutes,
    heldMinutes: minutes,
    availableMinutes: minutes,
    expiringAvailableMinutes: minutes,
  })
  .refine(
    (totals) =>
      totals.purchasedMinutes - totals.usedMinutes - totals.heldMinutes ===
        totals.availableMinutes &&
      totals.expiringAvailableMinutes <= totals.availableMinutes &&
      (totals.activeCount === 0
        ? totals.purchasedMinutes === 0
        : totals.purchasedMinutes >= totals.activeCount),
    'Membership balances do not reconcile',
  )

export const branchSettlementSnapshotSchema = z
  .strictObject({
    version: z.literal(1),
    type: z.literal('invoice.branch-settlement'),
    source: z.string().min(1).max(32),
    branchId: invoiceEventIdSchema,
    month: invoiceReconciliationMonthSchema,
    observedAt: z.iso.datetime(),
    through: z.iso.date(),
    membershipBalances: membershipBalancesSchema.optional(),
    report: z.strictObject({
      memberships: z.strictObject({
        deliveredMinutes: z.int(),
        deliveredValuePaise: z.int(),
        ownMembersMinutes: z.int(),
        ownMembersValuePaise: z.int(),
        toReceivePaise: z.int(),
        toPayPaise: z.int(),
      }),
      gems: z.strictObject({
        issued: z.int(),
        redeemed: z.int(),
        toReceivePaise: z.int(),
        toPayPaise: z.int(),
      }),
    }),
  })
  .refine(({ month, through }) => through.startsWith(`${month}-`))

export type BranchSettlementSnapshot = z.infer<typeof branchSettlementSnapshotSchema>
