// biome-ignore-all lint/suspicious/noUndeclaredEnvVars: Standalone Playwright fixtures.
import { hasRoleState, IMPERSONATED_ROLE } from './auth'

export function localSignedOrigin() {
  const origin = URL.parse(process.env.PLAYWRIGHT_ADMIN_BASE_URL ?? '')
  const database = URL.parse(process.env.DATABASE_URL ?? '')
  if (
    origin?.protocol !== 'http:' ||
    origin.hostname !== '127.0.0.1' ||
    !origin.port ||
    origin.href !== `${origin.origin}/` ||
    database?.protocol !== 'postgresql:' ||
    !['127.0.0.1', 'localhost'].includes(database.hostname) ||
    !/^\/rgss_rehearsal_[a-z0-9_]+$/.test(database.pathname) ||
    !process.env.REHEARSAL_PG_DATA ||
    IMPERSONATED_ROLE ||
    !hasRoleState('owner') ||
    !hasRoleState('manager')
  ) {
    throw new Error(
      'Use the loopback rehearsal app, synthetic database and signed fixture sessions',
    )
  }
  return origin.origin
}
