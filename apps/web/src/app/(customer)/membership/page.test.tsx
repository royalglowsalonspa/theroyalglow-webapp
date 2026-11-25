import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({ getOwnMemberships: vi.fn(), getMembershipSessions: vi.fn() }))

vi.mock('@rgss/db/queries', () => db)
vi.mock('@/lib/auth-server', () => ({
  auth: { api: { getSession: vi.fn().mockResolvedValue({ user: { id: 'customer_1' } }) } },
}))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))

import MembershipPage from './page'

const membership = {
  id: 'membership_1',
  membershipNumber: 'MEM-1',
  totalHoursMinutes: 120,
  usedHoursMinutes: 30,
  reservedMinutes: 0,
  pricePaidPaise: 120_000,
  sellingBranchName: 'Rayasandra',
  startsAt: new Date('2026-11-01T00:00:00.000Z'),
  expiresAt: new Date('2026-11-25T18:29:59.999Z'),
  status: 'active',
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-25T18:30:00.000Z') })
  db.getMembershipSessions.mockResolvedValue([])
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('membership validity', () => {
  it('shows expiry from the term even before the nightly job updates the stored status', async () => {
    db.getOwnMemberships.mockResolvedValue({ active: membership, past: [] })
    render(await MembershipPage())

    expect(screen.getByText('Expired')).toBeVisible()
    expect(screen.getByText('Unused')).toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows a future membership as scheduled', async () => {
    db.getOwnMemberships.mockResolvedValue({
      active: {
        ...membership,
        startsAt: new Date('2026-11-28T00:00:00.000Z'),
        expiresAt: new Date('2026-12-30T18:29:59.999Z'),
      },
      past: [],
    })
    render(await MembershipPage())

    expect(screen.getByText('Scheduled')).toBeVisible()
    expect(screen.getByText('Starts on')).toBeVisible()
  })
})
