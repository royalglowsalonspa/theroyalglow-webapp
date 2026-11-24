// biome-ignore-all lint/suspicious/noUndeclaredEnvVars: Standalone rehearsal script, outside Turbo.
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { type ConnectionStateChange, ErrorInfo, Realtime, Rest } from 'ably'
import { rehearsalAblyKey } from '../../../scripts/release/rehearsal-config'

const TOKEN_REVOKED = 40141
const TOKEN_TTL_MS = 120_000
const REVOCATION_TIMEOUT_MS = 15_000
const ABLY_APP_ID = /^[a-zA-Z0-9_-]+$/

type RehearsalEnvironment = Readonly<Record<string, string | undefined>>

class RehearsalError extends Error {}

export async function rehearseAblyRevocation(environment: RehearsalEnvironment) {
  const key = environment.REHEARSAL_ABLY_KEY
  const expectedApp = environment.REHEARSAL_ABLY_APP_ID
  const productionApp = environment.PRODUCTION_ABLY_APP_ID
  if (
    !key ||
    !expectedApp ||
    !productionApp ||
    !ABLY_APP_ID.test(expectedApp) ||
    !ABLY_APP_ID.test(productionApp) ||
    expectedApp === productionApp
  ) {
    throw new RehearsalError(
      'Use a dedicated rehearsal Ably key and confirm both app IDs before running',
    )
  }
  try {
    rehearsalAblyKey(key, expectedApp)
  } catch {
    throw new RehearsalError('The key does not match the isolated rehearsal Ably app')
  }

  return verifySyntheticRevocation(key, expectedApp)
}

export async function runAblyRevocationCanary(
  args: readonly string[],
  environment: RehearsalEnvironment,
) {
  if (args.length === 0) return rehearseAblyRevocation(environment)

  if (args.length !== 1 || args[0] !== '--confirm-production-synthetic-revocation') {
    throw new RehearsalError(
      'Usage: rehearse-ably-revocation.ts [--confirm-production-synthetic-revocation]',
    )
  }

  const { ABLY_PRIVATE_KEY: key, PRODUCTION_ABLY_APP_ID: expectedApp } = environment
  if (!key || !expectedApp || !ABLY_APP_ID.test(expectedApp)) {
    throw new RehearsalError('Set the production Ably key and confirm the deployed app ID')
  }
  try {
    rehearsalAblyKey(key, expectedApp)
  } catch {
    throw new RehearsalError('The key does not match the confirmed production Ably app')
  }
  return verifySyntheticRevocation(key, expectedApp)
}

async function verifySyntheticRevocation(key: string, expectedApp: string) {
  // Both modes mint a unique subscribe-only token and target only its client ID.
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
      throw new RehearsalError('The synthetic subscriber did not establish a live connection')
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
        throw new RehearsalError('Ably did not confirm revocation of the synthetic subscriber')
      }
      const code = await invalidated.promise
      if (code === null) {
        throw new RehearsalError(
          'The connected subscriber did not report token revocation before timeout',
        )
      }
      return { appId: expectedApp, fixture, existingConnectionError: code }
    } finally {
      clearTimeout(timer)
      client.connection.off('disconnected', onDisconnected)
    }
  } finally {
    client.close()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(await runAblyRevocationCanary(process.argv.slice(2), process.env)))
  } catch (error) {
    // A transport error can include the SDK request or key configuration.
    console.error(
      error instanceof ErrorInfo
        ? `Ably rehearsal failed with provider code ${error.code}`
        : error instanceof RehearsalError
          ? error.message
          : 'Ably rehearsal did not pass',
    )
    process.exitCode = 1
  }
}
