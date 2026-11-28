import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { beforeEach, expect, it, vi } from 'vitest'

const execute = vi.hoisted(() => vi.fn<(statement: SQL) => Promise<{ rows: unknown[] }>>())
vi.mock('../index', () => ({ db: { execute } }))

import { readCheckoutCollections } from './invoice-collections'

const start = new Date('2026-09-30T18:30:00.000Z')
const end = new Date('2026-10-31T18:30:00.000Z')
const branchId = 'branch-1'

beforeEach(() => execute.mockReset())

it('reads only checkout receipts at the selected branch, grouped by IST day and method', async () => {
  execute.mockResolvedValue({
    rows: [
      { day: '2026-10-01', method: 'cash', receiptCount: '2', totalPaise: '52344' },
      { day: '2026-10-31', method: 'upi', receiptCount: '1', totalPaise: '9007199254740991' },
    ],
  })

  await expect(readCheckoutCollections(start, end, branchId)).resolves.toEqual([
    { day: '2026-10-01', method: 'cash', receiptCount: 2, totalPaise: 52344 },
    { day: '2026-10-31', method: 'upi', receiptCount: 1, totalPaise: Number.MAX_SAFE_INTEGER },
  ])
  expect(execute).toHaveBeenCalledOnce()
  const statement = execute.mock.calls[0]?.[0]
  if (!statement) throw new Error('Expected the checkout receipt query')
  const query = new PgDialect().sqlToQuery(statement)
  expect(query.params).toEqual([branchId, start.toISOString(), end.toISOString()])
  expect(query.sql).toMatch(/to_char\(p\.received_at AT TIME ZONE 'Asia\/Kolkata', 'YYYY-MM-DD'\)/i)
  expect(query.sql).toMatch(/count\(\*\)::text AS "receiptCount"/i)
  expect(query.sql).toMatch(/sum\(p\.amount_paise\)::text AS "totalPaise"/i)
  expect(query.sql).toMatch(/FROM customer_payment p/i)
  expect(query.sql).toMatch(/p\.branch_id = \$1 AND p\.source = 'service_checkout'/i)
  expect(query.sql).toMatch(/p\.received_at >= \$2[^\n]*\s+AND p\.received_at < \$3/i)
  expect(query.sql).toMatch(/GROUP BY day, method\s+ORDER BY day, method/i)
  expect(query.sql).not.toMatch(/join|payment_reference|source_key|recorded_by/i)
})

it.each(['totalPaise', 'receiptCount'])(
  'rejects a %s above the safe integer range',
  async (field) => {
    execute.mockResolvedValue({
      rows: [
        {
          day: '2026-10-01',
          method: 'card',
          receiptCount: '1',
          totalPaise: '1',
          [field]: '9007199254740993',
        },
      ],
    })

    await expect(readCheckoutCollections(start, end, branchId)).rejects.toThrow('safe integer')
  },
)

it('rejects invalid periods before querying receipts', async () => {
  await expect(readCheckoutCollections(end, start, branchId)).rejects.toBeInstanceOf(RangeError)
  await expect(readCheckoutCollections(start, new Date(NaN), branchId)).rejects.toBeInstanceOf(
    RangeError,
  )
  expect(execute).not.toHaveBeenCalled()
})
