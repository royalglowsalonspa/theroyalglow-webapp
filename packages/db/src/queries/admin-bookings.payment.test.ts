import { neonConfig } from '@neondatabase/serverless'
import { afterEach, expect, it, vi } from 'vitest'
import { completeBookingWithInvoice } from './admin-bookings'

type NeonRequest = { query: string; params: string[] }

const existingFetch = neonConfig.fetchFunction
const checkout: Parameters<typeof completeBookingWithInvoice>[0] = {
  bookingId: 'booking-1',
  changedById: 'staff-1',
  settlement: { gemValuePaise: 100, shareBps: 0 },
  invoice: {
    branchId: 'branch-1',
    customerId: 'customer-1',
    invoiceType: 'service',
    paymentMethod: 'upi',
    subtotalPaise: 50000,
    discountAmountPaise: 0,
    taxableValuePaise: 40000,
    gstAmountPaise: 10000,
    cgstPaise: 5000,
    sgstPaise: 5000,
    totalAmountPaise: 50000,
    gemsEarned: 0,
    taxPointAt: new Date('2026-11-25T10:30:00.000Z'),
    financialYear: '2627',
    taxReviewStatus: 'reviewed',
  },
  items: [],
}

afterEach(() => {
  neonConfig.fetchFunction = existingFetch
  vi.unstubAllEnvs()
})

function captureCheckoutBatches() {
  vi.stubEnv('DATABASE_URL', 'postgresql://fixture:fixture@fixture.invalid/checkout')
  const batches: NeonRequest[][] = []
  neonConfig.fetchFunction = async (_input: RequestInfo | URL, options?: RequestInit) => {
    if (typeof options?.body !== 'string') throw new Error('Expected a Neon query body')
    const request: { queries?: NeonRequest[] } = JSON.parse(options.body)
    if (request.queries) {
      batches.push(request.queries)
      return Response.json({ results: request.queries.map(() => ({ fields: [], rows: [] })) })
    }
    return Response.json({ fields: [{ name: 'status', dataTypeID: 25 }], rows: [['confirmed']] })
  }

  return batches
}

it('records the saved tender and its invoice allocation in the guarded checkout batch', async () => {
  const batches = captureCheckoutBatches()
  await completeBookingWithInvoice(checkout)

  expect(batches).toHaveLength(1)
  const statements = batches[0] ?? []
  const ledger = statements.findIndex(({ query }) => query.includes('INSERT INTO customer_payment'))
  expect(ledger).toBeGreaterThan(
    statements.findIndex(({ query }) => /INSERT INTO invoice_issue_outbox/i.test(query)),
  )
  expect(statements[ledger]?.params).toContain('staff-1')
  const query = statements[ledger]?.query
  expect(query).toMatch(/i\.branch_id, i\.payment_method, i\.total_amount_paise, i\.paid_at/i)
  expect(query).toMatch(/i\.invoice_type = 'service' AND i\.payment_status = 'paid'/i)
  expect(query).toMatch(/i\.total_amount_paise > 0/i)
  expect(query).toMatch(/INSERT INTO invoice_payment_allocation/i)
  expect(query).toMatch(/SELECT id, source_key, branch_id, amount_paise FROM receipt/i)
})

it('captures both tenders and allocates both receipts within the same invoice transaction', async () => {
  const batches = captureCheckoutBatches()
  const paymentTenders = [
    { method: 'upi', amountPaise: 17333 },
    { method: 'cash', amountPaise: 32667 },
  ] satisfies NonNullable<typeof checkout.paymentTenders>

  await completeBookingWithInvoice({ ...checkout, paymentTenders })

  expect(batches).toHaveLength(1)
  const statements = batches[0] ?? []
  const snapshotIndex = statements.findIndex(({ query }) =>
    query.includes('INSERT INTO invoice_issue_outbox'),
  )
  const ledgerIndex = statements.findIndex(({ query }) =>
    query.includes('INSERT INTO customer_payment'),
  )
  expect(snapshotIndex).toBeGreaterThanOrEqual(0)
  expect(ledgerIndex).toBeGreaterThan(snapshotIndex)
  expect(statements[snapshotIndex]?.params).toContain(JSON.stringify(paymentTenders))
  expect(statements[ledgerIndex]?.params).toEqual(
    expect.arrayContaining(['upi', '17333', 'cash', '32667', 'staff-1']),
  )
  expect(statements[ledgerIndex]?.query).toMatch(
    /i\.total_amount_paise = \(SELECT sum\(amount_paise\) FROM tender\)/i,
  )
  expect(statements[ledgerIndex]?.query).toMatch(/INSERT INTO invoice_payment_allocation/i)
  expect(statements[ledgerIndex]?.query).toMatch(/CASE WHEN count\(\*\) = 2/i)
})

it('refuses a split total that differs from the invoice before making any database request', async () => {
  const fetch = vi.fn()
  neonConfig.fetchFunction = fetch
  await expect(
    completeBookingWithInvoice({
      ...checkout,
      paymentTenders: [
        { method: 'upi', amountPaise: 20000 },
        { method: 'cash', amountPaise: 20000 },
      ],
    }),
  ).rejects.toThrow('Split payments must equal the saved service invoice total')
  expect(fetch).not.toHaveBeenCalled()
})
