/************************************************************
 * Module Name  : memberships.test
 * Scope        : Data Access — Memberships
 *
 * Description  : recordMembershipSession must deduct the minutes in the same
 *                db.batch() transaction as the booking and invoice, guarded so
 *                that an inactive, expired or short membership aborts the whole
 *                batch. It stores a prefixed idempotency key, so a retry can
 *                never record twice. getMembershipSessionByKey must resolve a
 *                key only to a session of the same membership.
 *
 * Approach     : The real query functions run against a fake `db` whose query
 *                builders only record their calls. SQL is rendered with
 *                Drizzle's PgDialect to check the bound values. Postgres
 *                behavior itself (the guard aborting, the unique index) was
 *                checked on a disposable Neon branch; see
 *                .kiro/specs/multi-branch-support/spike-results.md §1.
 ************************************************************/

import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => {
  type Call = { method: string; args: unknown[] }
  type Recorded = {
    op: 'select' | 'update' | 'insert' | 'execute'
    args: unknown[]
    calls: Call[]
  }

  const records: Recorded[] = []
  const batches: Recorded[][] = []
  const byBuilder = new WeakMap<object, Recorded>()
  const state = {
    // Results for queries awaited on their own, handed out in await order.
    awaitQueue: [] as unknown[],
    batchResult: [] as unknown,
    batchError: undefined as unknown,
  }

  // A chainable builder: every method records its arguments and returns the
  // builder; awaiting it resolves the next entry of `state.awaitQueue`.
  function chain(record: Recorded): object {
    const builder: object = new Proxy(
      {},
      {
        get(_target, prop) {
          if (typeof prop === 'symbol') {
            return undefined
          }
          if (prop === 'then') {
            return (resolve: (value: unknown) => void) => {
              resolve(state.awaitQueue.length > 0 ? state.awaitQueue.shift() : [])
            }
          }
          return (...args: unknown[]) => {
            record.calls.push({ method: prop, args })
            return builder
          }
        },
      },
    )
    byBuilder.set(builder, record)
    return builder
  }

  function start(op: Recorded['op'], args: unknown[]) {
    const record: Recorded = { op, args, calls: [] }
    records.push(record)
    return chain(record)
  }

  return {
    records,
    batches,
    state,
    db: {
      select: (...args: unknown[]) => start('select', args),
      update: (...args: unknown[]) => start('update', args),
      insert: (...args: unknown[]) => start('insert', args),
      execute: (...args: unknown[]) => start('execute', args),
      async batch(items: object[]) {
        batches.push(items.map((item) => byBuilder.get(item) as Recorded))
        if (state.batchError !== undefined) {
          throw state.batchError
        }
        return state.batchResult
      },
    },
    reset() {
      records.length = 0
      batches.length = 0
      state.awaitQueue = []
      state.batchResult = []
      state.batchError = undefined
    },
  }
})

vi.mock('../index', () => ({ db: fake.db }))

import { booking, bookingService, bookingStatusLog } from '../schema/booking'
import { invoice, invoiceItem } from '../schema/invoice'
import { spaMembership } from '../schema/membership'
import { invoiceSequence } from '../schema/tax'
import {
  completeMembershipSession,
  getMembershipSessionByKey,
  recordMembershipSession,
} from './memberships'

const dialect = new PgDialect()

type Recorded = (typeof fake.records)[number]

function argOf(record: Recorded | undefined, method: string): unknown {
  return record?.calls.find((c) => c.method === method)?.args[0]
}

function render(value: unknown) {
  const { sql, params } = dialect.sqlToQuery(value as SQL)
  return { sql: sql.replace(/\s+/g, ' ').trim(), params }
}

const PARAMS = {
  membershipId: 'mem_1',
  bookingNumber: 'BK-RS-2610-S-12345-M',
  branchId: 'branch_rayasandra',
  customerId: 'usr_1',
  bookingDate: new Date('2026-10-28T00:00:00.000Z'),
  startTime: '10:00',
  endTime: '11:30',
  services: [
    {
      serviceId: 'svc_aroma_60',
      staffId: 'stf_1',
      serviceNameSnapshot: 'Aroma 60',
      staffNameSnapshot: 'Anita',
      durationMinutes: 60,
    },
    { serviceId: 'svc_scrub_30', serviceNameSnapshot: 'Scrub 30', durationMinutes: 30 },
  ],
  idempotencyKey: 'key-0000001',
  recordedById: 'usr_reception',
}

const COMPLETE = {
  bookingId: 'bk_1',
  branchId: 'branch_rayasandra',
  changedById: 'usr_reception',
  invoice: {
    taxPointAt: new Date('2026-10-28T06:30:00.000Z'),
    financialYear: '2627',
    taxReviewStatus: 'provisional' as const,
    lineTax: [
      { sacCode: '999723', taxVersionId: 'tax_rs_999723', rateBps: 500 },
      { sacCode: '999723', taxVersionId: 'tax_rs_999723', rateBps: 500 },
    ],
  },
  lines: [
    { serviceId: 'svc_aroma_60', serviceNameSnapshot: 'Aroma 60', staffNameSnapshot: 'Anita' },
    { serviceId: 'svc_scrub_30', serviceNameSnapshot: 'Scrub 30', staffNameSnapshot: 'Anita' },
  ],
  settlement: { shareBps: 10_000 },
}

const BOOKING_ROW = { id: 'bk_1', bookingNumber: PARAMS.bookingNumber }
const INVOICE_ROW = { id: 'inv_1', invoiceNumber: 'RS/2627/000042' }

// Record now: booking, lines, status log, balance.
function recordResult(total: number, used: number, reserved: number) {
  return [[BOOKING_ROW], {}, {}, [{ total, used, reserved }]]
}

// Complete: guard, status log, counter, invoice, items, entry, KPIs, booking,
// balance.
function completeResult(total: number, used: number, reserved: number) {
  return [
    { rows: [{ ok: 1 }] },
    {},
    {},
    [INVOICE_ROW],
    {},
    {},
    {},
    [BOOKING_ROW],
    [{ total, used, reserved }],
  ]
}

beforeEach(() => {
  fake.reset()
  fake.state.batchResult = recordResult(600, 210, 90)
})

describe('recordMembershipSession (Record now)', () => {
  it('writes the in-progress booking, its lines and its status log in one batch', async () => {
    await recordMembershipSession(PARAMS)

    expect(fake.batches).toHaveLength(1)
    const statements = fake.batches[0] ?? []
    expect(statements.map((s) => s.op)).toEqual(['insert', 'insert', 'insert', 'select'])
    expect(statements[0]?.args[0]).toBe(booking)
    expect(statements[1]?.args[0]).toBe(bookingService)
    expect(statements[2]?.args[0]).toBe(bookingStatusLog)
    expect(argOf(statements[3], 'from')).toBe(spaMembership)
  })

  it('starts the session now; the database holds its minutes with the booking (0026)', async () => {
    await recordMembershipSession(PARAMS)
    const statements = fake.batches[0] ?? []

    const values = argOf(statements[0], 'values') as Record<string, unknown>
    expect(values).toMatchObject({
      status: 'in_progress',
      isMembershipSession: true,
      spaMembershipId: 'mem_1',
      totalDurationMinutes: 90,
      totalAmountPaise: 0,
      redemptionKey: 'msess:key-0000001',
    })
    expect(values.startedAt).toBeInstanceOf(Date)
    expect(values.confirmedAt).toEqual(values.startedAt)
    expect(values).not.toHaveProperty('completedAt')
    expect(argOf(statements[2], 'values')).toMatchObject({
      fromStatus: null,
      toStatus: 'in_progress',
      changedById: 'usr_reception',
    })
  })

  it('issues no invoice and writes no settlement entry until it completes', async () => {
    await recordMembershipSession(PARAMS)
    const tables = (fake.batches[0] ?? []).map((s) => s.args[0])

    expect(tables).not.toContain(invoice)
    expect(tables).not.toContain(invoiceSequence)
    expect(fake.batches[0]?.some((s) => s.op === 'execute')).toBe(false)
  })

  it('stores no key when the request has none', async () => {
    await recordMembershipSession({ ...PARAMS, idempotencyKey: null })

    expect(argOf(fake.batches[0]?.[0], 'values')).toMatchObject({ redemptionKey: null })
  })

  it('returns the booking and the minutes left free after the hold', async () => {
    await expect(recordMembershipSession(PARAMS)).resolves.toEqual({
      ok: true,
      booking: BOOKING_ROW,
      remainingMinutes: 300,
    })
  })

  it.each([
    [
      'too few minutes free',
      Object.assign(new Error('check'), {
        code: '23514',
        constraint: 'spa_membership_reserved_check',
      }),
    ],
    [
      'a membership not valid now (wrapped)',
      new Error('Failed query', {
        cause: Object.assign(new Error('check'), {
          code: '23514',
          constraint: 'membership_hold_validity',
        }),
      }),
    ],
  ])('reports a refused hold (%s) as unavailable', async (_label, error) => {
    fake.state.batchError = error

    await expect(recordMembershipSession(PARAMS)).resolves.toEqual({
      ok: false,
      reason: 'unavailable',
    })
  })

  it.each([
    [
      'with the constraint name',
      Object.assign(new Error('duplicate key'), {
        code: '23505',
        constraint: 'booking_redemption_key_uidx',
      }),
    ],
    [
      'named only in the message',
      Object.assign(
        new Error('duplicate key value violates unique constraint "booking_redemption_key_uidx"'),
        { code: '23505' },
      ),
    ],
  ])('reports a reused idempotency key (%s) as a duplicate', async (_label, error) => {
    fake.state.batchError = error

    await expect(recordMembershipSession(PARAMS)).resolves.toEqual({
      ok: false,
      reason: 'duplicate_key',
    })
  })

  it('rethrows any other violation or failure', async () => {
    const otherCheck = Object.assign(new Error('check'), {
      code: '23514',
      constraint: 'booking_total_check',
    })
    fake.state.batchError = otherCheck
    await expect(recordMembershipSession(PARAMS)).rejects.toBe(otherCheck)

    const outage = new Error('fetch failed')
    fake.state.batchError = outage
    await expect(recordMembershipSession(PARAMS)).rejects.toBe(outage)
  })
})

describe('completeMembershipSession', () => {
  beforeEach(() => {
    fake.state.awaitQueue = [[{ customerId: 'usr_1' }]]
    fake.state.batchResult = completeResult(600, 300, 0)
  })

  it('completes, logs, invoices and settles in one batch', async () => {
    await completeMembershipSession(COMPLETE)

    expect(fake.batches).toHaveLength(1)
    const statements = fake.batches[0] ?? []
    expect(statements.map((s) => s.op)).toEqual([
      'execute',
      'insert',
      'insert',
      'insert',
      'insert',
      'execute',
      'execute',
      'select',
      'select',
    ])
    expect(statements[1]?.args[0]).toBe(bookingStatusLog)
    expect(statements[2]?.args[0]).toBe(invoiceSequence)
    expect(statements[3]?.args[0]).toBe(invoice)
    expect(statements[4]?.args[0]).toBe(invoiceItem)
  })

  it('moves only an in-progress session of the branch, aborting otherwise', async () => {
    await completeMembershipSession(COMPLETE)

    const guard = render(fake.batches[0]?.[0]?.args[0])
    expect(guard.sql).toContain("SET status = 'completed', completed_at = now()")
    expect(guard.sql).toContain('AND is_membership_session')
    expect(guard.sql).toContain("AND status = 'in_progress'")
    expect(guard.sql).toContain('SELECT 1 / count(*)::int AS ok FROM done')
    expect(guard.params).toEqual(['bk_1', 'branch_rayasandra'])
    expect(argOf(fake.batches[0]?.[1], 'values')).toMatchObject({
      fromStatus: 'in_progress',
      toStatus: 'completed',
      changedById: 'usr_reception',
    })
  })

  it('issues the ₹0 session invoice from the delivering branch, each line with its SAC code and rate (TX-07)', async () => {
    await completeMembershipSession(COMPLETE)
    const statements = fake.batches[0] ?? []

    expect(argOf(statements[3], 'values')).toMatchObject({
      branchId: 'branch_rayasandra',
      bookingId: 'bk_1',
      customerId: 'usr_1',
      invoiceType: 'membership_session',
      financialYear: '2627',
      taxReviewStatus: 'provisional',
      totalAmountPaise: 0,
      gemsEarned: 0,
    })
    const lines = argOf(statements[4], 'values') as Record<string, unknown>[]
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatchObject({
      serviceId: 'svc_aroma_60',
      staffNameSnapshot: 'Anita',
      sacCode: '999723',
      taxVersionId: 'tax_rs_999723',
      rateBps: 500,
      totalPricePaise: 0,
    })
  })

  it('values the settlement entry from the minutes used after this consumption (MS-20, MS-23)', async () => {
    await completeMembershipSession(COMPLETE)

    const entry = render(fake.batches[0]?.[5]?.args[0])
    expect(entry.sql).toContain("WHERE h.booking_id = $1 AND h.state = 'consumed'")
    expect(entry.sql).toContain('m.price_paid_paise::bigint AS price')
    expect(entry.sql).toContain(
      '(x.price * x.used) / x.total - (x.price * (x.used - x.minutes)) / x.total AS value',
    )
    expect(entry.sql).toContain(
      '(p.gst * x.used) / x.total - (p.gst * (x.used - x.minutes)) / x.total AS gst',
    )
    expect(entry.sql).toContain('INSERT INTO settlement_entry')
    expect(entry.params).toEqual(expect.arrayContaining(['bk_1', 10_000, 'usr_reception']))
  })

  it('returns the booking, its invoice and the minutes left free', async () => {
    await expect(completeMembershipSession(COMPLETE)).resolves.toEqual({
      ok: true,
      booking: BOOKING_ROW,
      invoice: INVOICE_ROW,
      remainingMinutes: 300,
    })
  })

  it('reports a session not in progress (the guard aborted) without writing', async () => {
    fake.state.batchError = Object.assign(new Error('division by zero'), { code: '22012' })

    await expect(completeMembershipSession(COMPLETE)).resolves.toEqual({
      ok: false,
      reason: 'not_in_progress',
    })
  })

  it('reports a booking not at the branch before writing anything', async () => {
    fake.state.awaitQueue = [[]]

    await expect(completeMembershipSession(COMPLETE)).resolves.toEqual({
      ok: false,
      reason: 'not_in_progress',
    })
    expect(fake.batches).toHaveLength(0)
  })
})

describe('getMembershipSessionByKey', () => {
  it('resolves the prefixed key only to a session booking of the same membership', async () => {
    fake.state.awaitQueue = [[]]

    await expect(getMembershipSessionByKey('mem_1', 'key-0000001')).resolves.toBeNull()

    const where = render(argOf(fake.records[0], 'where'))
    expect(where.sql).toContain('"booking"."redemption_key" = $1')
    expect(where.sql).toContain('"booking"."spa_membership_id" = $2')
    expect(where.sql).toContain('"booking"."is_membership_session" = $3')
    expect(where.params).toEqual(['msess:key-0000001', 'mem_1', true])
  })

  it('returns the session with its lines, invoice and the minutes free now', async () => {
    const found = { id: 'bk_1', bookingNumber: PARAMS.bookingNumber }
    const lines = [{ serviceId: 'svc_aroma_60', durationMinutes: 60, staffId: 'stf_1' }]
    fake.state.awaitQueue = [
      [found],
      lines,
      [INVOICE_ROW],
      [{ total: 600, used: 300, reserved: 60 }],
    ]

    await expect(getMembershipSessionByKey('mem_1', 'key-0000001')).resolves.toEqual({
      booking: found,
      invoice: INVOICE_ROW,
      services: lines,
      remainingMinutes: 240,
    })
  })

  it('answers a session still in progress with no invoice yet', async () => {
    const found = { id: 'bk_1', bookingNumber: PARAMS.bookingNumber }
    fake.state.awaitQueue = [[found], [], [], [{ total: 600, used: 0, reserved: 90 }]]

    await expect(getMembershipSessionByKey('mem_1', 'key-0000001')).resolves.toMatchObject({
      invoice: null,
      remainingMinutes: 510,
    })
  })
})
