/************************************************************
 * Module Name  : customer-stats.test
 * Scope        : Data Access — CRM customer KPI recompute
 *
 * Description  : The KPI recompute must (1) be a single set-based statement,
 *                (2) scope to the requested customers via bound parameters,
 *                (3) derive visits from completed bookings and LTV from paid
 *                invoices, and (4) only write rows whose values changed.
 *                The SQL is rendered with Drizzle's PgDialect (no database);
 *                the write paths are checked to run it inside their batch.
 ************************************************************/

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it, vi } from 'vitest'

const execute = vi.hoisted(() => vi.fn())
vi.mock('../index', () => ({ db: { execute } }))

import { customerStatsRefreshSql, refreshCustomerStats } from './customer-stats'

const dialect = new PgDialect()
const HERE = dirname(fileURLToPath(import.meta.url))

describe('customerStatsRefreshSql', () => {
  it('targets every profile when no customer list is given', () => {
    const query = dialect.sqlToQuery(customerStatsRefreshSql(null))
    expect(query.sql).toContain('WITH target AS (SELECT user_id FROM customer_profile)')
    expect(query.params).toEqual([])
  })

  it('scopes to the given customers with bound parameters', () => {
    const query = dialect.sqlToQuery(customerStatsRefreshSql(['u_1', "u_2'; drop"]))
    expect(query.sql).toContain('WHERE user_id IN ($1, $2)')
    expect(query.params).toEqual(['u_1', "u_2'; drop"])
  })

  it('derives visits from completed bookings and LTV from paid invoices', () => {
    const { sql } = dialect.sqlToQuery(customerStatsRefreshSql(null))
    expect(sql).toContain("WHERE b.status = 'completed'")
    expect(sql).toContain("WHERE i.payment_status = 'paid'")
    // Visit instant is the IST appointment start, not the server clock.
    expect(sql).toContain("(b.booking_date + b.start_time) AT TIME ZONE 'Asia/Kolkata'")
  })

  it('recomputes (assigns) rather than increments, and skips unchanged rows', () => {
    const { sql } = dialect.sqlToQuery(customerStatsRefreshSql(null))
    expect(sql).toContain('total_visits      = c.total_visits')
    expect(sql).not.toMatch(/total_visits\s*=\s*cp\.total_visits\s*\+/)
    expect(sql).toContain('IS DISTINCT FROM')
  })

  it('never derives the manager-adjustable no-show counter', () => {
    const { sql } = dialect.sqlToQuery(customerStatsRefreshSql(null))
    expect(sql).not.toContain('noshow_count')
  })
})

describe('refreshCustomerStats', () => {
  it('is a no-op for an explicit empty list', async () => {
    execute.mockClear()
    expect(await refreshCustomerStats([])).toBe(0)
    expect(execute).not.toHaveBeenCalled()
  })

  it('returns the number of profiles that changed', async () => {
    execute.mockResolvedValueOnce({ rows: [{ user_id: 'a' }, { user_id: 'b' }] })
    expect(await refreshCustomerStats()).toBe(2)
  })
})

describe('write paths refresh the KPIs inside their atomic batch', () => {
  const source = (file: string) => readFileSync(join(HERE, file), 'utf8')

  it('booking completion appends the refresh to its batch', () => {
    const body = source('admin-bookings.ts')
    expect(body).toContain('statements.push(refreshCustomerStatsStatement(inv.customerId))')
  })

  it('membership purchase and session recording include the refresh', () => {
    const body = source('memberships.ts')
    expect(body.split('refreshCustomerStatsStatement(params.customerId)').length - 1).toBe(2)
  })
})
