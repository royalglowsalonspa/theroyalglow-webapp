import { PgDialect } from 'drizzle-orm/pg-core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { update, set, where, returning } = vi.hoisted(() => ({
  update: vi.fn(),
  set: vi.fn(),
  where: vi.fn(),
  returning: vi.fn(),
}))

vi.mock('../index', () => ({ db: { update } }))

import { updateWaitlistStatus } from './waitlist'

beforeEach(() => {
  vi.clearAllMocks()
  update.mockReturnValue({ set })
  set.mockReturnValue({ where })
  where.mockReturnValue({ returning })
})

describe('updateWaitlistStatus', () => {
  it('guards the write with the branch and state that were read', async () => {
    returning.mockResolvedValueOnce([])

    expect(await updateWaitlistStatus('w1', 'branch-a', 'waiting', 'notified')).toBeNull()

    const query = new PgDialect().sqlToQuery(where.mock.calls[0]?.[0])
    expect(query.sql).toContain('"waitlist"."id" = $1')
    expect(query.sql).toContain('"waitlist"."branch_id" = $2')
    expect(query.sql).toContain('"waitlist"."status" = $3')
    expect(query.params).toEqual(['w1', 'branch-a', 'waiting'])
    expect(set).toHaveBeenCalledWith({ status: 'notified', notifiedAt: expect.any(Date) })
  })

  it('preserves the original notification timestamp when marking a booking', async () => {
    const updated = { id: 'w1', status: 'booked', notifiedAt: new Date('2026-11-25T09:00:00Z') }
    returning.mockResolvedValueOnce([updated])

    expect(await updateWaitlistStatus('w1', 'branch-a', 'notified', 'booked')).toEqual(updated)
    expect(set).toHaveBeenCalledWith({ status: 'booked' })
  })
})
