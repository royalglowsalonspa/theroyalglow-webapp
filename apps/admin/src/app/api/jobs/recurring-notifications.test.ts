// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createNotificationOnce: vi.fn(),
  getBirthdayCustomers: vi.fn(),
  getGemsExpiringInDays: vi.fn(),
  getMembershipsExpiringInDays: vi.fn(),
  getNudgeEligibleMemberships: vi.fn(),
  hasNotification: vi.fn(),
  hasNotificationSince: vi.fn(),
  dispatch: vi.fn(),
  heartbeat: vi.fn(),
  verify: vi.fn(),
}))

vi.mock('@rgss/db/queries', () => mocks)
vi.mock('@/lib/jobs/heartbeat', () => ({ pingHeartbeat: mocks.heartbeat }))
vi.mock('@/lib/jobs/verify', () => ({ verifyQStashSignature: mocks.verify }))
vi.mock('@/lib/notifications/dispatch', () => ({ dispatchNotification: mocks.dispatch }))

import { POST as birthday } from './birthday-emails/route'
import { POST as gemsExpiry } from './gems-expiry-reminder/route'
import { POST as membershipExpiry } from './membership-expiry/route'
import { POST as usageNudge } from './membership-usage-nudges/route'

function request() {
  return new Request('https://admin.theroyalglow.in/api/jobs/test', { method: 'POST', body: '{}' })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-24T18:45:00Z') })
  mocks.verify.mockResolvedValue(true)
  mocks.hasNotification.mockResolvedValue(false)
  mocks.hasNotificationSince.mockResolvedValue(false)
  const claimed = new Set<string>()
  mocks.createNotificationOnce.mockImplementation(async (notification: { id: string }) => {
    if (claimed.has(notification.id)) return null
    claimed.add(notification.id)
    return notification
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('recurring notification transitions', () => {
  it('uses one birthday claim per year and allows the next year', async () => {
    mocks.getBirthdayCustomers.mockResolvedValue([{ userId: 'customer', customerName: 'Test' }])

    await Promise.all([birthday(request()), birthday(request())])
    expect(mocks.dispatch).toHaveBeenCalledTimes(1)
    expect(mocks.hasNotificationSince).toHaveBeenCalledWith(
      'customer',
      'birthday_offer',
      new Date('2025-12-31T18:30:00Z'),
    )

    vi.setSystemTime(new Date('2027-11-24T18:45:00Z'))
    await birthday(request())
    expect(mocks.dispatch).toHaveBeenCalledTimes(2)
    expect(mocks.dispatch.mock.calls.map(([event]) => event.id)).toEqual([
      'birthday_offer:["customer","2026"]',
      'birthday_offer:["customer","2027"]',
    ])
  })

  it('deduplicates gems reminders for one expiry date and allows a later date', async () => {
    mocks.getGemsExpiringInDays.mockResolvedValue([{ customerId: 'customer', expiringGems: 50 }])

    await Promise.all([gemsExpiry(request()), gemsExpiry(request())])
    expect(mocks.dispatch).toHaveBeenCalledTimes(1)

    vi.setSystemTime(new Date('2026-11-25T18:45:00Z'))
    await gemsExpiry(request())
    expect(mocks.dispatch.mock.calls.map(([event]) => event.id)).toEqual([
      'gems_expiry_7d:["customer","2026-12-02"]',
      'gems_expiry_7d:["customer","2026-12-03"]',
    ])
  })

  it('allows a later membership to receive the same reminder tier', async () => {
    let member = { id: 'old', expiry: new Date('2026-12-02T10:00:00Z') }
    mocks.getMembershipsExpiringInDays.mockImplementation(async (days: number) =>
      days === 7
        ? [
            {
              id: member.id,
              expiresAt: member.expiry,
              userId: 'customer',
              membershipAlertsEnabled: true,
            },
          ]
        : [],
    )

    await Promise.all([membershipExpiry(request()), membershipExpiry(request())])
    expect(mocks.dispatch).toHaveBeenCalledTimes(1)

    member = { id: 'renewed', expiry: new Date('2027-02-02T10:00:00Z') }
    vi.setSystemTime(new Date('2027-01-25T18:45:00Z'))
    await membershipExpiry(request())
    expect(mocks.dispatch.mock.calls.map(([event]) => event.id)).toEqual([
      'membership_expiry_7d:["old","2026-12-02"]',
      'membership_expiry_7d:["renewed","2027-02-02"]',
    ])
  })

  it('recognizes a notification from the current legacy reminder window', async () => {
    mocks.getGemsExpiringInDays.mockResolvedValue([{ customerId: 'customer', expiringGems: 50 }])
    mocks.hasNotificationSince.mockResolvedValueOnce(true)

    await gemsExpiry(request())

    expect(mocks.hasNotificationSince).toHaveBeenCalledWith(
      'customer',
      'gems_expiry_7d',
      new Date('2026-11-24T18:30:00Z'),
    )
    expect(mocks.createNotificationOnce).not.toHaveBeenCalled()
  })

  it('keeps usage nudges at most once per customer across overlapping jobs', async () => {
    mocks.getNudgeEligibleMemberships.mockResolvedValue([
      {
        userId: 'customer',
        membershipAlertsEnabled: true,
        totalHoursMinutes: 120,
        usedHoursMinutes: 30,
      },
    ])

    await Promise.all([usageNudge(request()), usageNudge(request())])

    expect(mocks.dispatch).toHaveBeenCalledTimes(1)
    expect(mocks.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'membership_usage_nudge:["customer"]' }),
    )
  })
})
