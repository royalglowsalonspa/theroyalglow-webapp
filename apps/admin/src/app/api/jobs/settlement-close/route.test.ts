// @vitest-environment node
/************************************************************
 * Module Name  : jobs/settlement-close route.test
 * Scope        : API — Background Jobs (multi-branch R10)
 *
 * Description  : POST /api/jobs/settlement-close verifies the QStash
 *                signature before any work, closes the ended months, pings
 *                the SETTLEMENT_CLOSE heartbeat only after a successful run
 *                (including one with nothing to close) and answers 500 on a
 *                failure so QStash retries, without the heartbeat.
 *
 * Approach     : verify, heartbeat and @rgss/db/queries are mocked.
 ************************************************************/

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  heartbeat: vi.fn(),
  close: vi.fn(),
}))

vi.mock('@rgss/db/queries', () => ({ closeSettlementMonths: mocks.close }))
vi.mock('@/lib/jobs/verify', () => ({ verifyQStashSignature: mocks.verify }))
vi.mock('@/lib/jobs/heartbeat', () => ({ pingHeartbeat: mocks.heartbeat }))

import { POST } from './route'

function request(body = '{}') {
  return new Request('https://admin.theroyalglow.in/api/jobs/settlement-close', {
    method: 'POST',
    body,
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.verify.mockResolvedValue(true)
  mocks.close.mockResolvedValue({ months: [] })
})

describe('POST /api/jobs/settlement-close', () => {
  it('rejects an unverified request before closing anything', async () => {
    mocks.verify.mockResolvedValue(false)

    const res = await POST(request())

    expect(res.status).toBe(401)
    expect(mocks.close).not.toHaveBeenCalled()
    expect(mocks.heartbeat).not.toHaveBeenCalled()
  })

  it('verifies the raw body it was sent', async () => {
    await POST(request('{"scheduleId":"sch_1"}'))

    expect(mocks.verify).toHaveBeenCalledWith(expect.any(Request), '{"scheduleId":"sch_1"}')
  })

  it('closes the ended months and reports them, then pings the heartbeat', async () => {
    const months = [
      { month: '2026-09', statements: 3 },
      { month: '2026-10', statements: 1 },
    ]
    mocks.close.mockResolvedValue({ months })

    const res = await POST(request())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, months })
    expect(mocks.close).toHaveBeenCalledOnce()
    expect(mocks.heartbeat).toHaveBeenCalledWith('SETTLEMENT_CLOSE')
  })

  it('pings the heartbeat on a day with no ended month to close', async () => {
    const res = await POST(request())

    expect(await res.json()).toEqual({ success: true, months: [] })
    expect(mocks.heartbeat).toHaveBeenCalledWith('SETTLEMENT_CLOSE')
  })

  it('answers 500 for QStash to retry, without the heartbeat, when the close fails', async () => {
    mocks.close.mockRejectedValue(new Error('connection reset'))

    const res = await POST(request())

    expect(res.status).toBe(500)
    expect(await res.text()).toBe('Job failed')
    expect(mocks.heartbeat).not.toHaveBeenCalled()
  })
})
