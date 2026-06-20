/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : env (admin)
 * Scope        : Environment Configuration
 *
 * Description  : Build-time validated environment variables using t3-env
 *                with Zod schemas for both server and client variables,
 *                scoped to the admin app (admin.theroyalglow.in).
 *
 * Responsibilities :
 * - Define and validate all admin server-side env vars at build time
 * - Define and validate all admin NEXT_PUBLIC_ client-side env vars
 * - Provide a single typed import for the entire admin app
 *
 * Features / Functionality :
 * - DB / auth / OAuth / realtime / rate-limit / webhook-signing vars
 * - Client vars (admin origin URL, Sentry DSN, Google + Ably keys)
 * - SKIP_ENV_VALIDATION escape hatch for CI/Docker builds
 *
 * Tech Stack   : @t3-oss/env-nextjs, Zod
 * Layer        : Infrastructure (Configuration)
 *
 * Dependencies : @t3-oss/env-nextjs, zod
 *
 * Notes        :
 * - Never use process.env directly — always import from this file
 * - Admin shares DATABASE_URL(_UNPOOLED) and BETTER_AUTH_SECRET with web
 * - Customer-only tracking vars (Meta Pixel, PostHog, Clarity, VAPID) are
 *   intentionally EXCLUDED — they are exclusive to apps/web (Req 12.5)
 ************************************************************/
import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

export const env = createEnv({
  server: {
    // Database (same Neon branch as web — Req 12.2)
    DATABASE_URL: z.string().url(),
    DATABASE_URL_UNPOOLED: z.string().url(),
    // Auth (Better Auth) — same BETTER_AUTH_SECRET value as web (Req 4.2)
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.string().url(),
    // Auth (Google OAuth) — shared OAuth app
    GOOGLE_OAUTH_CLIENT_ID: z.string().min(1),
    GOOGLE_OAUTH_CLIENT_SECRET: z.string().min(1),
    // Realtime (Ably) — shared realtime key
    ABLY_PRIVATE_KEY: z.string().min(1),
    // Rate limiting (Upstash Redis)
    UPSTASH_REDIS_REST_URL: z.string().url(),
    UPSTASH_REDIS_REST_TOKEN: z.string().min(1),
    // Webhook HMAC verification (QStash)
    QSTASH_CURRENT_SIGNING_KEY: z.string().min(1),
    QSTASH_NEXT_SIGNING_KEY: z.string().min(1),
  },
  client: {
    // Admin origin (https://admin.theroyalglow.in in prod — Req 12.3)
    NEXT_PUBLIC_APP_URL: z.string().url(),
    // Separate admin Sentry project (Req 6.6, 12.3)
    NEXT_PUBLIC_SENTRY_DSN: z.string().url(),
    // Google One Tap (if used)
    NEXT_PUBLIC_GOOGLE_CLIENT_ID: z.string().min(1),
    // Client realtime
    NEXT_PUBLIC_ABLY_KEY: z.string().min(1),
  },
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_URL_UNPOOLED: process.env.DATABASE_URL_UNPOOLED,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    GOOGLE_OAUTH_CLIENT_ID: process.env.GOOGLE_OAUTH_CLIENT_ID,
    GOOGLE_OAUTH_CLIENT_SECRET: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    ABLY_PRIVATE_KEY: process.env.ABLY_PRIVATE_KEY,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    QSTASH_CURRENT_SIGNING_KEY: process.env.QSTASH_CURRENT_SIGNING_KEY,
    QSTASH_NEXT_SIGNING_KEY: process.env.QSTASH_NEXT_SIGNING_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_GOOGLE_CLIENT_ID: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
    NEXT_PUBLIC_ABLY_KEY: process.env.NEXT_PUBLIC_ABLY_KEY,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
})
