/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : env.test (admin)
 * Scope        : Testing — Environment Configuration
 *
 * Description  : Unit tests for the admin app's build-time env validation
 *                (`src/env.ts`). Verifies that required variables are enforced,
 *                that `SKIP_ENV_VALIDATION` bypasses validation, and that
 *                customer-only tracking variables are excluded from the schema.
 *
 * Responsibilities :
 * - Assert a fully-populated env parses and exposes its values (Req 12.1)
 * - Assert a missing required var throws when validation is on (Req 12.1)
 * - Assert SKIP_ENV_VALIDATION bypasses validation (Req 12.6)
 * - Assert customer tracking vars are absent from the parsed env (Req 12.5)
 *
 * Tech Stack   : TypeScript, Vitest
 * Layer        : Testing (Infrastructure / Configuration)
 *
 * Notes        : `env.ts` runs `createEnv` at import time, so each scenario
 *                stubs `process.env`, resets the module registry, and performs
 *                a fresh dynamic `import('@/env')`.
 *
 *                Pinned to the Node test environment: `@t3-oss/env-nextjs`
 *                treats access as client-side when `window` is defined (jsdom),
 *                which blocks server-var reads. Node has no `window`, so server
 *                vars resolve correctly here. This overrides the workspace's
 *                jsdom `admin` project for this file only.
 *
 * @vitest-environment node
 ************************************************************/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// A complete, valid set of admin-scoped env vars matching the Zod schema in
// `src/env.ts` (server + client). Used as the baseline for each scenario.
const VALID_ENV: Record<string, string> = {
  // server
  DATABASE_URL: 'postgresql://user:pass@db.example.com:5432/rgss',
  DATABASE_URL_UNPOOLED: 'postgresql://user:pass@db.example.com:5432/rgss',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  BETTER_AUTH_URL: 'https://admin.theroyalglow.in',
  GOOGLE_OAUTH_CLIENT_ID: 'google-oauth-client-id',
  GOOGLE_OAUTH_CLIENT_SECRET: 'google-oauth-client-secret',
  ABLY_PRIVATE_KEY: 'ably-private-key',
  UPSTASH_REDIS_REST_URL: 'https://redis.example.com',
  UPSTASH_REDIS_REST_TOKEN: 'redis-token',
  QSTASH_CURRENT_SIGNING_KEY: 'qstash-current-signing-key',
  QSTASH_NEXT_SIGNING_KEY: 'qstash-next-signing-key',
  // QStash publish token — required by the relocated background-job runtime
  // (schedule registration + triggered enqueue). Added with the admin job
  // wiring (mirrors apps/web).
  QSTASH_TOKEN: 'qstash-publish-token',
  // client
  NEXT_PUBLIC_APP_URL: 'https://admin.theroyalglow.in',
  NEXT_PUBLIC_ADMIN_SENTRY_DSN: 'https://examplePublicKey@o0.ingest.sentry.io/0',
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: 'public-google-client-id',
  NEXT_PUBLIC_ABLY_KEY: 'public-ably-key',
}

// Customer-only tracking vars that MUST NOT appear in the admin env schema
// (Req 12.5) — these are exclusive to apps/web.
const CUSTOMER_TRACKING_VARS = [
  'NEXT_PUBLIC_META_PIXEL_ID',
  'NEXT_PUBLIC_POSTHOG_KEY',
  'NEXT_PUBLIC_POSTHOG_HOST',
  'NEXT_PUBLIC_CLARITY_ID',
  'NEXT_PUBLIC_VAPID_PUBLIC_KEY',
] as const

/**
 * Stub `process.env` with the provided entries for the duration of a test.
 * Uses `vi.stubEnv` so values are restored by `vi.unstubAllEnvs()`.
 */
function applyEnv(entries: Record<string, string>) {
  for (const [key, value] of Object.entries(entries)) {
    vi.stubEnv(key, value)
  }
}

describe('admin env validation (src/env.ts)', () => {
  beforeEach(() => {
    vi.resetModules()
    // Ensure no ambient values leak into the validation. Explicitly clear every
    // var the schema cares about plus the tracking vars and the skip flag.
    for (const key of [
      ...Object.keys(VALID_ENV),
      ...CUSTOMER_TRACKING_VARS,
      'SKIP_ENV_VALIDATION',
    ]) {
      vi.stubEnv(key, '')
      delete process.env[key]
    }
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('parses successfully and exposes values when all required vars are set (Req 12.1)', async () => {
    applyEnv(VALID_ENV)

    const { env } = await import('@/env')

    expect(env.DATABASE_URL).toBe(VALID_ENV.DATABASE_URL)
    expect(env.BETTER_AUTH_SECRET).toBe(VALID_ENV.BETTER_AUTH_SECRET)
    expect(env.NEXT_PUBLIC_APP_URL).toBe(VALID_ENV.NEXT_PUBLIC_APP_URL)
    expect(env.NEXT_PUBLIC_ABLY_KEY).toBe(VALID_ENV.NEXT_PUBLIC_ABLY_KEY)
  })

  it('throws when a required var is missing and SKIP_ENV_VALIDATION is unset (Req 12.1)', async () => {
    const { DATABASE_URL: _omitted, ...withoutDatabaseUrl } = VALID_ENV
    applyEnv(withoutDatabaseUrl)
    // DATABASE_URL intentionally left unset.

    await expect(import('@/env')).rejects.toThrow()
  })

  it('bypasses validation when SKIP_ENV_VALIDATION is truthy (Req 12.6)', async () => {
    const { DATABASE_URL: _omitted, ...withoutDatabaseUrl } = VALID_ENV
    applyEnv(withoutDatabaseUrl)
    // Required var still missing, but validation is skipped.
    vi.stubEnv('SKIP_ENV_VALIDATION', '1')

    await expect(import('@/env')).resolves.toBeDefined()
  })

  it('excludes customer-only tracking vars from the schema even when present in the environment (Req 12.5)', async () => {
    applyEnv(VALID_ENV)
    // Inject the customer tracking vars into the environment to prove the admin
    // schema does not pick them up.
    for (const key of CUSTOMER_TRACKING_VARS) {
      vi.stubEnv(key, 'should-not-be-exposed')
    }

    const { env } = await import('@/env')
    const exposedKeys = Object.keys(env)

    for (const trackingVar of CUSTOMER_TRACKING_VARS) {
      expect(exposedKeys).not.toContain(trackingVar)
    }
  })
})
