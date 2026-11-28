import { z } from 'zod'
import { INVOICE_ISSUE_EVENT_PATH, invoiceEventIdSchema } from './invoice-issue-event'
import { invoiceReconciliationMonthSchema } from './invoice-reconciliation'

export const INVOICE_CHECKOUT_COLLECTIONS_PATH = `${INVOICE_ISSUE_EVENT_PATH}/checkout-collections`
export const invoiceCheckoutCollectionMethodSchema = z.enum(['cash', 'upi', 'card', 'online'])

export const checkoutCollectionsSnapshotSchema = z
  .strictObject({
    version: z.literal(1),
    type: z.literal('invoice.checkout-collections'),
    source: z.string().min(1).max(32),
    branchId: invoiceEventIdSchema,
    month: invoiceReconciliationMonthSchema,
    observedAt: z.iso.datetime(),
    rows: z
      .array(
        z.strictObject({
          day: z.iso.date(),
          method: invoiceCheckoutCollectionMethodSchema,
          receiptCount: z.int().positive(),
          totalPaise: z.int().positive(),
        }),
      )
      .max(31 * 4),
  })
  .refine(({ month, rows }) => {
    const days = new Set<string>()
    let totalPaise = 0
    let receiptCount = 0
    for (const row of rows) {
      const key = `${row.day}/${row.method}`
      if (!row.day.startsWith(`${month}-`) || days.has(key) || row.totalPaise < row.receiptCount)
        return false
      days.add(key)
      totalPaise += row.totalPaise
      receiptCount += row.receiptCount
    }
    return Number.isSafeInteger(totalPaise) && Number.isSafeInteger(receiptCount)
  })

export type CheckoutCollectionsSnapshot = z.infer<typeof checkoutCollectionsSnapshotSchema>
