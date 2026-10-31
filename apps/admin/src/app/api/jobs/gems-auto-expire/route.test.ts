// @vitest-environment node
/************************************************************
 * Module Name  : jobs/gems-auto-expire route.test
 * Scope        : API — Background Jobs (multi-branch ST-04)
 *
 * Description  : POST /api/jobs/gems-auto-expire verifies the QStash
 *                signature before any work, runs the expiry, answers with what
 *                it expired and gave back, pings the GEMS_EXPIRE heartbeat on
 *                success, and answers 500 on failure so QStash retries.
 *
 * Approach     : verify, heartbeat and @rgss/db/queries are mocked.
 ************************************************************/

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  heartbeat: vi.fn(),
  expire: vi.fn(),
}))

vi.mock('@rgss/db/queries', () => ({ jobGemsAutoExpire: mocks.expire }))
vi.mock('@/lib/jobs/verify', () => ({ verifyQStashSignature: mocks.verify }))
vi.mock('@/lib/jobs/heartbeat', () => ({ pingHeartbeat: mocks.heartbeat }))

import { POST } from './route'

function request() {
  return new Request('https://admin.theroyalglow.in/api/jobs/gems-auto-expire', {
    method: 'POST',
    body: '{}',
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.verify.mockResolvedValue(true)
  mocks.expire.mockResolvedValue({ batches: 0, gems: 0, returned: 0 })
})

describe('POST /api/jobs/gems-auto-expire', () => {
  it('rejects an unverified request before expiring anything', async () => {
    mocks.verify.mockResolvedValue(false)

    const res = await POST(request())

    expect(res.status).toBe(401)
    expect(mocks.expire).not.toHaveBeenCalled()
    expect(mocks.heartbeat).not.toHaveBeenCalled()
  })

  it('answers with the batches and gems expired and the redemptions given back', async () => {
    mocks.expire.mockResolvedValue({ batches: 2, gems: 37, returned: 1 })

    const res = await POST(request())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, batches: 2, gems: 37, returned: 1 })
    expect(mocks.heartbeat).toHaveBeenCalledWith('GEMS_EXPIRE')
  })

  it('pings the heartbeat on a night with nothing to expire', async () => {
    const res = await POST(request())

    expect(await res.json()).toEqual({ success: true, batches: 0, gems: 0, returned: 0 })
    expect(mocks.heartbeat).toHaveBeenCalledWith('GEMS_EXPIRE')
  })

  it('answers 500 for QStash to retry, without the heartbeat, when the expiry fails', async () => {
    mocks.expire.mockRejectedValue(new Error('canceling statement due to lock timeout'))

    const res = await POST(request())

    expect(res.status).toBe(500)
    expect(mocks.heartbeat).not.toHaveBeenCalled()
  })
})
