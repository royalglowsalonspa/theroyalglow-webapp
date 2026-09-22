// @vitest-environment node
import { randomInt } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  eligible: vi.fn(),
  hasNotification: vi.fn(),
  createNotification: vi.fn(),
  dispatch: vi.fn(),
  heartbeat: vi.fn(),
}))

vi.mock('node:crypto', () => ({ randomInt: vi.fn() }))
vi.mock('@rgss/db/queries', () => ({
  getNudgeEligibleMemberships: mocks.eligible,
  hasNotification: mocks.hasNotification,
  createNotification: mocks.createNotification,
}))
vi.mock('@/lib/jobs/verify', () => ({ verifyQStashSignature: mocks.verify }))
vi.mock('@/lib/jobs/heartbeat', () => ({ pingHeartbeat: mocks.heartbeat }))
vi.mock('@/lib/notifications/dispatch', () => ({ dispatchNotification: mocks.dispatch }))

import { POST } from './route'

function member(index: number, membershipAlertsEnabled = true) {
  return {
    id: `membership-${index}`,
    userId: `user-${index}`,
    totalHoursMinutes: 120,
    usedHoursMinutes: 30,
    membershipAlertsEnabled,
  }
}

function request() {
  return new Request('https://admin.theroyalglow.in/api/jobs/membership-usage-nudges', {
    method: 'POST',
    body: '{}',
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.verify.mockResolvedValue(true)
  mocks.eligible.mockResolvedValue([])
  mocks.hasNotification.mockResolvedValue(false)
  mocks.createNotification.mockImplementation(async (input) => ({ id: 'notification', ...input }))
  // Always select the upper valid index, leaving input order intact.
  vi.mocked(randomInt).mockImplementation((max) => max - 1)
})

describe('membership usage nudges', () => {
  it('rejects an unverified request before querying or sending', async () => {
    mocks.verify.mockResolvedValue(false)

    expect((await POST(request())).status).toBe(401)
    expect(mocks.eligible).not.toHaveBeenCalled()
    expect(randomInt).not.toHaveBeenCalled()
    expect(mocks.dispatch).not.toHaveBeenCalled()
  })

  it('uses secure random selection while preserving the batch cap, preferences and dedupe', async () => {
    mocks.eligible.mockResolvedValue([
      member(99, false),
      ...Array.from({ length: 25 }, (_, i) => member(i)),
    ])
    mocks.hasNotification.mockImplementation(async (userId) => userId === 'user-0')

    const response = await POST(request())

    expect(await response.json()).toEqual({ success: true, processed: 19 })
    expect(randomInt).toHaveBeenCalledTimes(24)
    expect(randomInt).toHaveBeenNthCalledWith(1, 25)
    expect(randomInt).toHaveBeenLastCalledWith(2)
    expect(mocks.hasNotification).toHaveBeenCalledTimes(20)
    expect(mocks.createNotification.mock.calls.map(([input]) => input.userId)).toEqual(
      Array.from({ length: 19 }, (_, i) => `user-${i + 1}`),
    )
    expect(mocks.dispatch).toHaveBeenCalledTimes(19)
    expect(mocks.heartbeat).toHaveBeenCalledWith('MEMBERSHIP_NUDGES')
  })

  it.each([0, 1])(
    'handles %i eligible members without requesting an invalid random range',
    async (count) => {
      mocks.eligible.mockResolvedValue(Array.from({ length: count }, (_, i) => member(i)))

      expect(await (await POST(request())).json()).toEqual({ success: true, processed: count })
      expect(randomInt).not.toHaveBeenCalled()
      expect(mocks.dispatch).toHaveBeenCalledTimes(count)
    },
  )
})
