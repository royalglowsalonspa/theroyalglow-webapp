import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const execute = vi.hoisted(() => vi.fn())
vi.mock('../index', () => ({ db: { execute } }))

import {
  claimPendingInvoiceIssues,
  finishInvoiceIssue,
  readPublishedInvoiceIssueBody,
  saveInvoiceIssueBody,
} from './invoice-issue-outbox'

const dialect = new PgDialect()
function write() {
  return dialect.sqlToQuery(execute.mock.calls[0]?.[0] as SQL)
}

beforeEach(() => execute.mockReset())

it('recovers only pinned bytes from a published event in the selected branch', async () => {
  const eventBody = '{ "version": 1 }'
  execute.mockResolvedValue({ rows: [{ eventBody }] })
  await expect(readPublishedInvoiceIssueBody('invoice-42', 'branch-1')).resolves.toBe(eventBody)
  const query = write()
  expect(query.params).toEqual(['invoice-42', 'branch-1'])
  expect(query.sql).toMatch(/JOIN invoice i ON i.id = o.invoice_id/)
  expect(query.sql).toMatch(/AND i.branch_id = \$2/)
  expect(query.sql).toMatch(/o.published_at IS NOT NULL AND o.event_body IS NOT NULL/)
  expect(query.sql).not.toMatch(/\bUPDATE\b/)
})

describe('invoice outbox leasing', () => {
  it('atomically locks a bounded batch of due invoices and advances each lease', async () => {
    const saved = {
      invoiceId: 'invoice-42',
      snapshot: { version: 1 },
      leaseToken: 'lease-fixture',
      attempts: 2,
      eventBody: '{"version":1}',
    }
    execute.mockResolvedValue({ rows: [saved] })

    await expect(claimPendingInvoiceIssues(3)).resolves.toEqual([saved])
    expect(execute).toHaveBeenCalledTimes(1)
    const query = write()
    expect(query.params).toContain(3)
    expect(query.sql).toMatch(/ready_at <= now\(\)/)
    expect(query.sql).toMatch(/FOR UPDATE SKIP LOCKED/)
    expect(query.sql).toMatch(/UPDATE invoice_issue_outbox/)
    expect(query.sql).toMatch(/attempts = outbox\.attempts \+ 1/)
  })

  it.each([0, -1, 1.5, 21, Number.POSITIVE_INFINITY])(
    'rejects a batch size of %s before querying',
    async (limit) => {
      await expect(claimPendingInvoiceIssues(limit)).rejects.toBeInstanceOf(RangeError)
      expect(execute).not.toHaveBeenCalled()
    },
  )

  it('persists the exact event body only while the first live lease still owns the row', async () => {
    execute.mockResolvedValue({ rows: [] })
    const body = '{"branchId":"fixture","name":"Café"}'

    await expect(saveInvoiceIssueBody('invoice-42', 'expired-lease', body)).resolves.toBe(false)
    const query = write()
    expect(query.params).toEqual(expect.arrayContaining(['invoice-42', 'expired-lease', body]))
    expect(query.sql).toMatch(/event_body IS NULL/)
    expect(query.sql).toMatch(/lease_token = \$\d+/)
    expect(query.sql).toMatch(/ready_at > now\(\)/)
  })

  it('releases the matching lease and schedules another attempt after a retryable failure', async () => {
    execute.mockResolvedValue({ rows: [{ invoiceId: 'invoice-42' }] })

    await expect(finishInvoiceIssue('invoice-42', 'lease-fixture', 'retry')).resolves.toBe(true)
    const query = write()
    expect(query.params).toEqual(expect.arrayContaining(['invoice-42', 'lease-fixture', 'retry']))
    expect(query.sql).toMatch(/interval '5 minutes'/)
    expect(query.sql).toMatch(/lease_token = NULL/)
    expect(query.sql).toMatch(/lease_token = \$\d+/)
    expect(query.sql).toMatch(/ready_at > now\(\)/)
  })
})
