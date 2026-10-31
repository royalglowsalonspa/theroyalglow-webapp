/************************************************************
 * Module Name  : users.test
 * Scope        : Data Access — Users / people lookup
 *
 * Description  : searchUsers must stay a bounded lookup: nothing for a short
 *                term (fewer than 3 characters, R1.11), never more than the
 *                cap, and each match's roster entry. getUserById reads one
 *                account by primary key.
 *
 * Approach     : The real query functions run against a fake `db` whose query
 *                builders only record their calls. SQL is rendered with
 *                Drizzle's PgDialect to check the bound values. Role changes
 *                are covered by branch-roles.test.ts.
 ************************************************************/

import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => {
  type Call = { method: string; args: unknown[] }
  type Recorded = { op: 'select'; args: unknown[]; calls: Call[] }

  const records: Recorded[] = []
  const awaited: Recorded[] = []
  const state = { awaitResult: [] as unknown }

  // A chainable builder: every method records its arguments and returns the
  // builder; awaiting it resolves `state.awaitResult`.
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
              awaited.push(record)
              resolve(state.awaitResult)
            }
          }
          return (...args: unknown[]) => {
            record.calls.push({ method: prop, args })
            return builder
          }
        },
      },
    )
    return builder
  }

  return {
    records,
    awaited,
    state,
    db: {
      select: (...args: unknown[]) => {
        const record: Recorded = { op: 'select', args, calls: [] }
        records.push(record)
        return chain(record)
      },
    },
    reset() {
      records.length = 0
      awaited.length = 0
      state.awaitResult = []
    },
  }
})

vi.mock('../index', () => ({ db: fake.db }))

import { getUserById, searchUsers, USER_SEARCH_LIMIT, USER_SEARCH_MIN_LENGTH } from './users'

const dialect = new PgDialect()
const USER_ROW = { id: 'u_1', name: 'Priya', email: 'priya@example.com', role: 'receptionist' }

type Recorded = (typeof fake.records)[number]

function argOf(record: Recorded | undefined, method: string): unknown {
  return record?.calls.find((c) => c.method === method)?.args[0]
}

function whereOf(record: Recorded | undefined) {
  const { sql, params } = dialect.sqlToQuery(argOf(record, 'where') as SQL)
  return { sql, params }
}

beforeEach(() => {
  fake.reset()
})

describe('getUserById', () => {
  it('reads the account by primary key', async () => {
    fake.state.awaitResult = [USER_ROW]

    expect(await getUserById('u_1')).toEqual(USER_ROW)
    expect(whereOf(fake.awaited[0])).toEqual({ sql: '"user"."id" = $1', params: ['u_1'] })
    expect(argOf(fake.awaited[0], 'limit')).toBe(1)
  })

  it('returns null when the account does not exist', async () => {
    fake.state.awaitResult = []
    expect(await getUserById('gone')).toBeNull()
  })
})

describe('searchUsers', () => {
  it('needs at least 3 characters', () => {
    expect(USER_SEARCH_MIN_LENGTH).toBe(3)
  })

  it('returns nothing for a blank or short term without querying', async () => {
    expect(await searchUsers('')).toEqual([])
    expect(await searchUsers(' p ')).toEqual([])
    expect(await searchUsers('pr')).toEqual([])
    expect(fake.records).toHaveLength(0)
  })

  it('caps the result size and reports each match’s Staff entry', async () => {
    fake.state.awaitResult = [
      { ...USER_ROW, phone: '9876543210', staffDesignation: null, staffIsActive: null },
      {
        ...USER_ROW,
        id: 'u_2',
        role: 'manager',
        phone: null,
        staffDesignation: 'manager',
        staffIsActive: true,
      },
    ]

    const rows = await searchUsers('priya', 500)

    expect(argOf(fake.records[0], 'limit')).toBe(USER_SEARCH_LIMIT)
    expect(rows).toEqual([
      { ...USER_ROW, phone: '9876543210', staff: null },
      {
        ...USER_ROW,
        id: 'u_2',
        role: 'manager',
        phone: null,
        staff: { designation: 'manager', isActive: true },
      },
    ])
  })
})
