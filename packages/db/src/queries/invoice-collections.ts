import { sql } from 'drizzle-orm'
import { db } from '../index'
import type { paymentMethodEnum } from '../schema/enums'

type CheckoutCollection = {
  day: string
  method: (typeof paymentMethodEnum.enumValues)[number]
  receiptCount: number
  totalPaise: number
}

type CheckoutCollectionResult = Omit<CheckoutCollection, 'receiptCount' | 'totalPaise'> & {
  receiptCount: string
  totalPaise: string
}

function parseAggregate(value: string): number {
  const parsed = Number(value)
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(parsed)) {
    throw new RangeError('Checkout collections aggregate is outside the safe integer range')
  }
  return parsed
}

/** Recorded checkout tenders by the day received, even if their invoices have another issue date. */
export async function readCheckoutCollections(
  startAt: Date,
  endAt: Date,
  branchId: string,
): Promise<CheckoutCollection[]> {
  if (!(startAt < endAt)) throw new RangeError('Invalid checkout collections period')
  const { rows } = await db.execute<CheckoutCollectionResult>(sql`
    SELECT to_char(p.received_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS day,
           p.payment_method::text AS method,
           count(*)::text AS "receiptCount",
           sum(p.amount_paise)::text AS "totalPaise"
    FROM customer_payment p
    WHERE p.branch_id = ${branchId} AND p.source = 'service_checkout'
      AND p.received_at >= ${startAt.toISOString()}::timestamptz
      AND p.received_at < ${endAt.toISOString()}::timestamptz
    GROUP BY day, method
    ORDER BY day, method
  `)
  return rows.map(({ day, method, receiptCount, totalPaise }) => ({
    day,
    method,
    receiptCount: parseAggregate(receiptCount),
    totalPaise: parseAggregate(totalPaise),
  }))
}
