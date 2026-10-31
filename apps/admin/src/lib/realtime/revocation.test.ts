// @vitest-environment node
/************************************************************
 * Module Name  : realtime/revocation.test
 * Scope        : Realtime — revoking live-update tokens after a role change (R2.6)
 *
 * Description  : The revocation steps by age, the Ably call (clientId targets,
 *                Basic auth with the issuing key), what each outcome records,
 *                and that a failure stays pending and is queued for a retry.
 *
 * Approach     : The outbox queries, fetch and enqueueJob are mocked; the
 *                step rule and the run logic stay real.
 ************************************************************/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const dbMocks = vi.hoisted(() => ({
  getPendingRealtimeRevocations: vi.fn(),
  recordRealtimeRevocationAttempt: vi.fn(),
  resolveRealtimeRevocations: vi.fn(),
}))
const enqueueJob = vi.hoisted(() => vi.fn())

vi.mock('@rgss/db/queries', () => dbMocks)
vi.mock('@/lib/jobs/enqueue', () => ({ enqueueJob }))

import {
  OLD_TOKENS_GONE_AFTER_MS,
  processRealtimeRevocations,
  revocationStep,
  revokeLiveUpdates,
  TOKEN_REQUEST_WINDOW_MS,
} from './revocation'

const NOW = new Date('2026-10-30T10:00:00.000Z')
const ago = (ms: number) => new Date(NOW.getTime() - ms)
const row = (id: string, userId: string, requestedAt: Date) => ({
  id,
  userId,
  requestedAt,
  attempts: 0,
  lastAttemptAt: null,
  lastError: null,
})

const fetchMock = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('ABLY_PRIVATE_KEY', 'app123.key456:secret789')
  dbMocks.resolveRealtimeRevocations.mockImplementation(async (ids: string[]) => ids.length)
  fetchMock.mockResolvedValue(new Response('{"successCount":1,"failureCount":0}', { status: 201 }))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('revocationStep', () => {
  it('revokes early inside the TokenRequest window, then finally after it', () => {
    expect(revocationStep(ago(0), NOW)).toBe('revoke_early')
    expect(revocationStep(ago(TOKEN_REQUEST_WINDOW_MS - 1), NOW)).toBe('revoke_early')
    expect(revocationStep(ago(TOKEN_REQUEST_WINDOW_MS), NOW)).toBe('revoke_final')
  })

  it('closes as expired once every token with the old access has expired', () => {
    expect(revocationStep(ago(OLD_TOKENS_GONE_AFTER_MS - 1), NOW)).toBe('revoke_final')
    expect(revocationStep(ago(OLD_TOKENS_GONE_AFTER_MS), NOW)).toBe('resolve_expired')
  })
})

describe('processRealtimeRevocations', () => {
  it('asks Ably to revoke by clientId with the issuing key, then resolves past the window', async () => {
    dbMocks.getPendingRealtimeRevocations.mockResolvedValue([
      row('r1', 'u1', ago(TOKEN_REQUEST_WINDOW_MS + 1000)),
    ])

    const run = await processRealtimeRevocations({ now: NOW })

    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe('https://rest.ably.io/keys/app123.key456/revokeTokens')
    expect(init?.headers.Authorization).toBe(`Basic ${btoa('app123.key456:secret789')}`)
    expect(JSON.parse(String(init?.body))).toEqual({ targets: ['clientId:u1'] })
    expect(dbMocks.recordRealtimeRevocationAttempt).toHaveBeenCalledWith(['r1'], null, NOW)
    expect(dbMocks.resolveRealtimeRevocations).toHaveBeenCalledWith(['r1'], 'revoked', NOW)
    expect(run).toEqual({ resolved: 1, pending: 0, failed: 0, nextAt: null })
  })

  it('keeps an early revocation pending until after the window', async () => {
    const requestedAt = ago(30_000)
    dbMocks.getPendingRealtimeRevocations.mockResolvedValue([row('r1', 'u1', requestedAt)])

    const run = await processRealtimeRevocations({ now: NOW })

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(dbMocks.resolveRealtimeRevocations).not.toHaveBeenCalledWith(
      ['r1'],
      'revoked',
      expect.anything(),
    )
    expect(run.pending).toBe(1)
    expect(run.nextAt).toEqual(new Date(requestedAt.getTime() + TOKEN_REQUEST_WINDOW_MS))
  })

  it('records a refused call and stays pending', async () => {
    dbMocks.getPendingRealtimeRevocations.mockResolvedValue([
      row('r1', 'u1', ago(TOKEN_REQUEST_WINDOW_MS + 1000)),
    ])
    fetchMock.mockResolvedValue(new Response('{"error":{"code":40160}}', { status: 401 }))

    const run = await processRealtimeRevocations({ now: NOW })

    expect(dbMocks.recordRealtimeRevocationAttempt).toHaveBeenCalledWith(
      ['r1'],
      expect.stringContaining('Ably 401'),
      NOW,
    )
    expect(dbMocks.resolveRealtimeRevocations).not.toHaveBeenCalledWith(
      ['r1'],
      'revoked',
      expect.anything(),
    )
    expect(run).toMatchObject({ pending: 1, failed: 1 })
  })

  it('treats a partial batch as a failure', async () => {
    dbMocks.getPendingRealtimeRevocations.mockResolvedValue([
      row('r1', 'u1', ago(TOKEN_REQUEST_WINDOW_MS + 1000)),
      row('r2', 'u2', ago(TOKEN_REQUEST_WINDOW_MS + 1000)),
    ])
    fetchMock.mockResolvedValue(
      new Response('{"successCount":1,"failureCount":1}', { status: 201 }),
    )

    expect((await processRealtimeRevocations({ now: NOW })).failed).toBe(2)
  })

  it('closes rows past the token lifetime as expired, without calling Ably', async () => {
    dbMocks.getPendingRealtimeRevocations.mockResolvedValue([
      row('r1', 'u1', ago(OLD_TOKENS_GONE_AFTER_MS + 1)),
    ])

    const run = await processRealtimeRevocations({ now: NOW })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(dbMocks.resolveRealtimeRevocations).toHaveBeenCalledWith(['r1'], 'expired', NOW)
    expect(run.resolved).toBe(1)
  })

  it('closes everything as not configured when realtime is off', async () => {
    vi.stubEnv('ABLY_PRIVATE_KEY', '')
    dbMocks.getPendingRealtimeRevocations.mockResolvedValue([row('r1', 'u1', ago(0))])

    await processRealtimeRevocations({ now: NOW })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(dbMocks.resolveRealtimeRevocations).toHaveBeenCalledWith(['r1'], 'not_configured', NOW)
  })

  it('revokes each person once even with several pending rows', async () => {
    dbMocks.getPendingRealtimeRevocations.mockResolvedValue([
      row('r1', 'u1', ago(TOKEN_REQUEST_WINDOW_MS + 1000)),
      row('r2', 'u1', ago(TOKEN_REQUEST_WINDOW_MS + 2000)),
    ])

    await processRealtimeRevocations({ now: NOW })

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      targets: ['clientId:u1'],
    })
  })
})

describe('revokeLiveUpdates', () => {
  it('does nothing when nobody was signed out', async () => {
    expect(await revokeLiveUpdates([])).toBe('none')
    expect(dbMocks.getPendingRealtimeRevocations).not.toHaveBeenCalled()
  })

  it('cuts off live connections now and queues the confirming call', async () => {
    dbMocks.getPendingRealtimeRevocations.mockResolvedValue([row('r1', 'u1', new Date())])

    expect(await revokeLiveUpdates(['u1'])).toBe('stopped')
    expect(dbMocks.getPendingRealtimeRevocations).toHaveBeenCalledWith({
      userIds: ['u1'],
      limit: 100,
    })
    const [path, , delaySeconds] = enqueueJob.mock.calls[0] ?? []
    expect(path).toBe('/api/jobs/realtime-revocations')
    expect(delaySeconds).toBeGreaterThanOrEqual(TOKEN_REQUEST_WINDOW_MS / 1000)
  })

  it('reports a refused call as retrying, and queues the retry', async () => {
    dbMocks.getPendingRealtimeRevocations.mockResolvedValue([row('r1', 'u1', new Date())])
    fetchMock.mockRejectedValue(new Error('network down'))

    expect(await revokeLiveUpdates(['u1'])).toBe('retrying')
    expect(enqueueJob).toHaveBeenCalledOnce()
  })

  it('reports not configured when realtime is off', async () => {
    vi.stubEnv('ABLY_PRIVATE_KEY', '')
    dbMocks.getPendingRealtimeRevocations.mockResolvedValue([row('r1', 'u1', new Date())])

    expect(await revokeLiveUpdates(['u1'])).toBe('not_configured')
    expect(enqueueJob).not.toHaveBeenCalled()
  })
})
