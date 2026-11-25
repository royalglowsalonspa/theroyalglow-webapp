// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findMembership: vi.fn(),
  heartbeat: vi.fn(),
  sendEmail: vi.fn(),
  verify: vi.fn(),
}))

vi.mock('@rgss/db/queries', () => ({ getMembershipById: mocks.findMembership }))
vi.mock('@/lib/jobs/heartbeat', () => ({ pingHeartbeat: mocks.heartbeat }))
vi.mock('@/lib/jobs/verify', () => ({ verifyQStashSignature: mocks.verify }))
vi.mock('@/lib/notifications/providers/email', () => ({ sendEmail: mocks.sendEmail }))

import { POST } from './route'

const NOW = new Date('2026-11-25T09:00:00.000Z')
const PAST = new Date('2026-11-25T08:00:00.000Z')
const FUTURE = new Date('2026-11-25T10:00:00.000Z')

function request() {
  return new Request('https://admin.theroyalglow.in/api/jobs/membership-expired-notice', {
    method: 'POST',
    body: JSON.stringify({ membershipId: 'membership-1' }),
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
  mocks.verify.mockResolvedValue(true)
  mocks.sendEmail.mockResolvedValue(true)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('membership expired notice', () => {
  it.each([
    { status: 'cancelled', expiresAt: PAST },
    { status: 'active', expiresAt: FUTURE },
  ])('skips $status membership with expiry at $expiresAt', async (membership) => {
    mocks.findMembership.mockResolvedValue({ ...membership, customerEmail: 'member@example.test' })

    const response = await POST(request())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, sent: false })
    expect(mocks.sendEmail).not.toHaveBeenCalled()
    expect(mocks.heartbeat).toHaveBeenCalledWith('MEMBERSHIP_EXPIRED_NOTICE')
  })

  it.each(['expired', 'active'] as const)(
    'sends after expiry when the stored status is %s',
    async (status) => {
      mocks.findMembership.mockResolvedValue({
        status,
        expiresAt: PAST,
        customerEmail: 'member@example.test',
      })

      const response = await POST(request())

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ success: true, sent: true })
      expect(mocks.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'member@example.test',
          idempotencyKey: 'membership-expired/membership-1',
        }),
      )
    },
  )
})
