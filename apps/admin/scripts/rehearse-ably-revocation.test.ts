// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { rehearseAblyRevocation, runAblyRevocationCanary } from './rehearse-ably-revocation'

type Disconnected = (change: { reason: { code: number } }) => void

const fixture = vi.hoisted(() => {
  const attach = vi.fn()
  return {
    attach,
    channel: vi.fn(() => ({ attach })),
    close: vi.fn(),
    on: vi.fn<(name: string, listener: Disconnected) => void>(),
    off: vi.fn(),
    requestToken: vi.fn(),
    revokeTokens: vi.fn(),
    createRest: vi.fn(),
    createRealtime: vi.fn(),
  }
})

vi.mock('ably', () => ({
  Rest: class {
    constructor(options: unknown) {
      fixture.createRest(options)
    }
    auth = { requestToken: fixture.requestToken, revokeTokens: fixture.revokeTokens }
  },
  Realtime: class {
    constructor(options: unknown) {
      fixture.createRealtime(options)
    }
    connection = { state: 'connected', on: fixture.on, off: fixture.off }
    channels = { get: fixture.channel }
    close = fixture.close
  },
}))

const environment = {
  REHEARSAL_ABLY_KEY: 'fixture-app.fixture-key:fixture-secret',
  REHEARSAL_ABLY_APP_ID: 'fixture-app',
  PRODUCTION_ABLY_APP_ID: 'production-app',
}

function disconnect(code: number) {
  const listener = fixture.on.mock.calls.at(-1)?.[1]
  if (!listener) throw new Error('Expected a disconnect listener')
  listener({ reason: { code } })
}

beforeEach(() => {
  vi.resetAllMocks()
  fixture.channel.mockReturnValue({ attach: fixture.attach })
  fixture.requestToken.mockResolvedValue({ token: 'fixture-token' })
})

afterEach(() => {
  vi.useRealTimers()
})

it.each([
  { ...environment, REHEARSAL_ABLY_APP_ID: 'production-app' },
  { ...environment, REHEARSAL_ABLY_KEY: 'another-app.fixture-key:fixture-secret' },
  { ...environment, REHEARSAL_ABLY_KEY: 'fixture-app.invalid-key' },
])('rejects a production app or mismatched key before constructing an SDK client', async (env) => {
  await expect(rehearseAblyRevocation(env)).rejects.toThrow()
  expect(fixture.createRest).not.toHaveBeenCalled()
  expect(fixture.createRealtime).not.toHaveBeenCalled()
})

it('requires the existing synthetic connection to report revocation', async () => {
  fixture.revokeTokens.mockImplementationOnce(() => {
    disconnect(40141)
    return { successCount: 1, failureCount: 0 }
  })

  const evidence = await rehearseAblyRevocation(environment)
  expect(evidence).toEqual({
    appId: 'fixture-app',
    fixture: expect.stringMatching(/^rgss-rehearsal-[\da-f-]+$/),
    existingConnectionError: 40141,
  })
  expect(fixture.requestToken).toHaveBeenCalledExactlyOnceWith({
    clientId: `${evidence.fixture}-subscriber`,
    ttl: 120_000,
    capability: JSON.stringify({ [evidence.fixture]: ['subscribe'] }),
  })
  expect(fixture.createRealtime).toHaveBeenCalledExactlyOnceWith({
    token: { token: 'fixture-token' },
    logLevel: 0,
    realtimeRequestTimeout: 5000,
  })
  expect(fixture.channel).toHaveBeenCalledExactlyOnceWith(evidence.fixture)
  expect(fixture.revokeTokens).toHaveBeenCalledExactlyOnceWith([
    { type: 'clientId', value: `${evidence.fixture}-subscriber` },
  ])
  expect(fixture.off).toHaveBeenCalledExactlyOnceWith('disconnected', fixture.on.mock.calls[0]?.[1])
  expect(fixture.close).toHaveBeenCalledExactlyOnceWith()
})

it('fails closed when Ably reports a failed revocation', async () => {
  fixture.revokeTokens.mockResolvedValueOnce({ successCount: 0, failureCount: 1 })
  await expect(rehearseAblyRevocation(environment)).rejects.toThrow('did not confirm revocation')
  expect(fixture.off).toHaveBeenCalledTimes(1)
  expect(fixture.close).toHaveBeenCalledTimes(1)
})

const productionEnvironment = {
  ...environment,
  ABLY_PRIVATE_KEY: 'production-app.fixture-key:fixture-secret',
}

it('requires explicit production confirmation and a matching production app', async () => {
  await expect(runAblyRevocationCanary(['--production'], productionEnvironment)).rejects.toThrow(
    'Usage:',
  )
  await expect(
    runAblyRevocationCanary(['--confirm-production-synthetic-revocation'], {
      ...productionEnvironment,
      ABLY_PRIVATE_KEY: environment.REHEARSAL_ABLY_KEY,
    }),
  ).rejects.toThrow('does not match the confirmed production Ably app')
  expect(fixture.createRest).not.toHaveBeenCalled()
  expect(fixture.revokeTokens).not.toHaveBeenCalled()
})

it('revokes only the unique subscribe-only token minted by the production canary', async () => {
  fixture.revokeTokens.mockImplementationOnce(() => {
    disconnect(40141)
    return { successCount: 1, failureCount: 0 }
  })
  const evidence = await runAblyRevocationCanary(
    ['--confirm-production-synthetic-revocation'],
    productionEnvironment,
  )
  expect(evidence.appId).toBe(productionEnvironment.PRODUCTION_ABLY_APP_ID)
  expect(fixture.createRest).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ key: productionEnvironment.ABLY_PRIVATE_KEY }),
  )
  expect(fixture.requestToken).toHaveBeenCalledExactlyOnceWith({
    clientId: `${evidence.fixture}-subscriber`,
    ttl: 120_000,
    capability: JSON.stringify({ [evidence.fixture]: ['subscribe'] }),
  })
  expect(fixture.revokeTokens).toHaveBeenCalledExactlyOnceWith([
    { type: 'clientId', value: `${evidence.fixture}-subscriber` },
  ])
})

it('rejects a generic disconnect even if the provider accepted the revocation request', async () => {
  vi.useFakeTimers()
  fixture.revokeTokens.mockImplementationOnce(() => {
    disconnect(80003)
    return { successCount: 1, failureCount: 0 }
  })
  const assertion = expect(rehearseAblyRevocation(environment)).rejects.toThrow(
    'did not report token revocation before timeout',
  )
  await vi.advanceTimersByTimeAsync(15_000)
  await assertion
  expect(fixture.off).toHaveBeenCalledTimes(1)
  expect(fixture.close).toHaveBeenCalledTimes(1)
})
