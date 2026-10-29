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

import { booking, bookingService } from '../schema/booking'
import { invoice, invoiceItem } from '../schema/invoice'
import { spaMembership } from '../schema/membership'
import { getMembershipSessionByKey, recordMembershipSession } from './memberships'

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
  invoiceNumber: 'INV-1-2627-54321',
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
}

const BOOKING_ROW = { id: 'bk_1', bookingNumber: PARAMS.bookingNumber }
const INVOICE_ROW = { id: 'inv_1', invoiceNumber: PARAMS.invoiceNumber }

// Batch results in statement order: booking, lines, guard, balance, invoice,
// items, stats.
function batchResult(total: number, used: number) {
  return [[BOOKING_ROW], {}, { rows: [{ ok: 1 }] }, [{ total, used }], [INVOICE_ROW], {}, {}]
}

beforeEach(() => {
  fake.reset()
  fake.state.batchResult = batchResult(600, 210)
})

describe('recordMembershipSession', () => {
  it('writes everything in one batch, with the booking first and the deduction before the invoice', async () => {
    await recordMembershipSession(PARAMS)

    expect(fake.batches).toHaveLength(1)
    const statements = fake.batches[0] ?? []
    expect(statements.map((s) => s.op)).toEqual([
      'insert',
      'insert',
      'execute',
      'select',
      'insert',
      'insert',
      'execute',
    ])
    expect(statements[0]?.args[0]).toBe(booking)
    expect(statements[1]?.args[0]).toBe(bookingService)
    expect(argOf(statements[3], 'from')).toBe(spaMembership)
    expect(statements[4]?.args[0]).toBe(invoice)
    expect(statements[5]?.args[0]).toBe(invoiceItem)
  })

  it('deducts only while the membership is active, unexpired and still has the minutes', async () => {
    await recordMembershipSession(PARAMS)

    const guard = render(fake.batches[0]?.[2]?.args[0])
    expect(guard.sql).toContain(
      'UPDATE spa_membership SET used_hours_minutes = used_hours_minutes + $1, updated_at = now() WHERE id = $2',
    )
    expect(guard.sql).toContain("AND status = 'active'")
    expect(guard.sql).toContain('AND expires_at >= now()')
    expect(guard.sql).toContain('AND used_hours_minutes + $3 <= total_hours_minutes')
    expect(guard.sql).toContain('SELECT 1 / count(*)::int AS ok FROM guard')
    expect(guard.params).toEqual([90, 'mem_1', 90])
  })

  it('stores the idempotency key on the session booking, prefixed', async () => {
    await recordMembershipSession(PARAMS)

    expect(argOf(fake.batches[0]?.[0], 'values')).toMatchObject({
      redemptionKey: 'msess:key-0000001',
      status: 'completed',
      isMembershipSession: true,
      spaMembershipId: 'mem_1',
      totalDurationMinutes: 90,
      totalAmountPaise: 0,
    })
  })

  it('stores no key when the request has none', async () => {
    await recordMembershipSession({ ...PARAMS, idempotencyKey: null })

    expect(argOf(fake.batches[0]?.[0], 'values')).toMatchObject({ redemptionKey: null })
  })

  it('returns the booking, invoice and the balance read after the deduction', async () => {
    await expect(recordMembershipSession(PARAMS)).resolves.toEqual({
      ok: true,
      booking: BOOKING_ROW,
      invoice: INVOICE_ROW,
      remainingMinutes: 390,
    })
  })

  it.each([
    ['the driver error', Object.assign(new Error('division by zero'), { code: '22012' })],
    [
      'a wrapped driver error',
      new Error('Failed query', {
        cause: Object.assign(new Error('division by zero'), { code: '22012' }),
      }),
    ],
    ['a message without a SQLSTATE', new Error('division by zero')],
  ])('reports a failed balance guard (%s) as unavailable', async (_label, error) => {
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

  it('rethrows any other unique violation or failure', async () => {
    const numberClash = Object.assign(new Error('duplicate key'), {
      code: '23505',
      constraint: 'booking_booking_number_unique',
    })
    fake.state.batchError = numberClash
    await expect(recordMembershipSession(PARAMS)).rejects.toBe(numberClash)

    const outage = new Error('fetch failed')
    fake.state.batchError = outage
    await expect(recordMembershipSession(PARAMS)).rejects.toBe(outage)
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

  it('returns the recorded session with its lines, invoice and current balance', async () => {
    const found = { id: 'bk_1', bookingNumber: PARAMS.bookingNumber }
    const lines = [{ serviceId: 'svc_aroma_60', durationMinutes: 60, staffId: 'stf_1' }]
    fake.state.awaitQueue = [[found], lines, [INVOICE_ROW], [{ total: 600, used: 300 }]]

    await expect(getMembershipSessionByKey('mem_1', 'key-0000001')).resolves.toEqual({
      booking: found,
      invoice: INVOICE_ROW,
      services: lines,
      remainingMinutes: 300,
    })
  })
})
