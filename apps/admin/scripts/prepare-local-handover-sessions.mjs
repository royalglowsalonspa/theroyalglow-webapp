import { stat, writeFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { env } from 'node:process'
import { db } from '@rgss/db'
import { account, session, user, verification } from '@rgss/db/schema'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { testUtils } from 'better-auth/plugins'

const stateDirectory = env.ADMIN_E2E_STATE_DIR
const origin = URL.parse(env.PLAYWRIGHT_ADMIN_BASE_URL ?? '')
if (
  env.APP_ENV !== 'test' ||
  env.ADMIN_E2E_LOCAL_HANDOVER !== '1' ||
  !env.BETTER_AUTH_SECRET ||
  origin?.protocol !== 'http:' ||
  origin.hostname !== '127.0.0.1' ||
  !origin.port ||
  origin.href !== `${origin.origin}/` ||
  env.BETTER_AUTH_URL !== origin.origin ||
  !stateDirectory ||
  !isAbsolute(stateDirectory) ||
  !(await stat(stateDirectory)).isDirectory()
) {
  throw new Error('Use the synthetic admin origin and an absolute local Playwright state directory')
}

// Verify the exact disposable PostgreSQL cluster before creating any sessions.
await import('../../../scripts/release/preload-local-rehearsal-db.mjs')

const auth = betterAuth({
  baseURL: origin.origin,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: { account, session, user, verification },
  }),
  session: { expiresIn: 15 * 60 },
  user: {
    additionalFields: { role: { type: 'string', required: false, input: false } },
  },
  plugins: [testUtils()],
})

const { test } = await auth.$context
const fixtures = [
  { role: 'owner', userId: 'rehearsal_mb_owner_ab', email: 'owner_ab@example.invalid' },
  { role: 'manager', userId: 'rehearsal_mb_a_manager', email: 'a.manager@example.invalid' },
]

for (const { role, userId, email } of fixtures) {
  const login = await test.login({ userId })
  if (login.user.role !== role || login.user.email !== email) {
    throw new Error('The local sign-in account does not match the synthetic role fixture')
  }
  await writeFile(
    join(stateDirectory, `${role}.json`),
    JSON.stringify({
      cookies: login.cookies,
      origins: [],
    }),
    { flag: 'wx', mode: 0o600 },
  )
}
