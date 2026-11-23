// biome-ignore-all lint/suspicious/noUndeclaredEnvVars: Standalone rehearsal script, outside Turbo.
import { randomUUID } from 'node:crypto'
import { type ConnectionStateChange, ErrorInfo, Realtime, Rest } from 'ably'

const TOKEN_REVOKED = 40141
const TOKEN_TTL_MS = 120_000
const REVOCATION_TIMEOUT_MS = 15_000
const ABLY_APP_ID = /^[a-zA-Z0-9_-]+$/

async function run() {
  const key = process.env.REHEARSAL_ABLY_KEY
  const expectedApp = process.env.REHEARSAL_ABLY_APP_ID
  const productionApp = process.env.PRODUCTION_ABLY_APP_ID
  if (
    !key ||
    !expectedApp ||
    !productionApp ||
    !ABLY_APP_ID.test(expectedApp) ||
    !ABLY_APP_ID.test(productionApp) ||
    expectedApp === productionApp ||
    key.split('.')[0] !== expectedApp
  ) {
    throw new Error('Use a dedicated rehearsal Ably key and confirm both app IDs before running')
  }

  // The provider request cannot target a real user or a production channel.
  const fixture = `rgss-rehearsal-${randomUUID()}`
  const clientId = `${fixture}-subscriber`
  const rest = new Rest({ key, logLevel: 0, httpRequestTimeout: 5000, httpMaxRetryCount: 0 })
  const token = await rest.auth.requestToken({
    clientId,
    ttl: TOKEN_TTL_MS,
    capability: JSON.stringify({ [fixture]: ['subscribe'] }),
  })
  // A static token makes the test observe the existing credential's loss. The
  // client cannot silently authorize itself again with a freshly issued token.
  const client = new Realtime({ token, logLevel: 0, realtimeRequestTimeout: 5000 })

  try {
    await client.channels.get(fixture).attach()
    if (client.connection.state !== 'connected') {
      throw new Error('The synthetic subscriber did not establish a live connection')
    }

    const invalidated = Promise.withResolvers<number | null>()
    const onDisconnected = (change: ConnectionStateChange) => {
      if (change.reason?.code === TOKEN_REVOKED) invalidated.resolve(TOKEN_REVOKED)
    }
    client.connection.on('disconnected', onDisconnected)
    const timer = setTimeout(() => invalidated.resolve(null), REVOCATION_TIMEOUT_MS)
    try {
      const { successCount, failureCount } = await rest.auth.revokeTokens([
        { type: 'clientId', value: clientId },
      ])
      if (successCount !== 1 || failureCount !== 0) {
        throw new Error('Ably did not confirm revocation of the synthetic subscriber')
      }
      const code = await invalidated.promise
      if (code === null) {
        throw new Error('The connected subscriber did not report token revocation before timeout')
      }
      console.log(JSON.stringify({ appId: expectedApp, fixture, existingConnectionError: code }))
    } finally {
      clearTimeout(timer)
      client.connection.off('disconnected', onDisconnected)
    }
  } finally {
    client.close()
  }
}

try {
  await run()
} catch (error) {
  if (error instanceof ErrorInfo) {
    console.error(`Ably rehearsal failed with provider code ${error.code}`)
  } else {
    console.error(error instanceof Error ? error.message : 'Ably rehearsal did not pass')
  }
  process.exitCode = 1
}
