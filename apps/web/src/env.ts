/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : env
 * Scope        : Environment Configuration
 *
 * Description  : Build-time validated environment variables using t3-env
 *                with Zod schemas for both server and client variables.
 *
 * Responsibilities :
 * - Define and validate all server-side env vars at build time
 * - Define and validate all NEXT_PUBLIC_ client-side env vars
 * - Provide a single typed import for the entire app
 *
 * Features / Functionality :
 * - 30+ server vars (DB, OAuth, APIs, jobs, monitoring)
 * - 6 client vars (URLs, keys for browser-side SDKs)
 * - SKIP_ENV_VALIDATION escape hatch for CI/Docker builds
 *
 * Tech Stack   : @t3-oss/env-nextjs, Zod
 * Layer        : Infrastructure (Configuration)
 *
 * Dependencies : @t3-oss/env-nextjs, zod
 *
 * Notes        :
 * - Never use process.env directly — always import from this file
 * - Background job vars are optional so builds never fail without them
 ************************************************************/
import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    BETTER_AUTH_SECRET: z.string().min(32).optional(),
    BETTER_AUTH_URL: z.string().url(),
    BETTER_AUTH_API_KEY: z.string().min(1).optional(),
    GOOGLE_OAUTH_CLIENT_ID: z.string().min(1),
    GOOGLE_OAUTH_CLIENT_SECRET: z.string().min(1),
    RESEND_API_KEY: z.string().startsWith('re_'),
    ABLY_PRIVATE_KEY: z.string().min(1),
    UPSTASH_REDIS_REST_URL: z.string().url(),
    UPSTASH_REDIS_REST_TOKEN: z.string().min(1),
    R2_ACCESS_KEY_ID: z.string().min(1),
    R2_SECRET_ACCESS_KEY: z.string().min(1),
    R2_BUCKET_NAME: z.string().min(1),
    META_PIXEL_ACCESS_TOKEN: z.string().min(1),
    QSTASH_TOKEN: z.string().min(1),
    QSTASH_CURRENT_SIGNING_KEY: z.string().min(1),
    QSTASH_NEXT_SIGNING_KEY: z.string().min(1),
    VAPID_PRIVATE_KEY: z.string().min(1),
    // Background jobs (Phase 6) — all optional so the build never requires them
    VAPID_SUBJECT: z.string().optional(),
    SLACK_WEBHOOK_URL: z.string().url().optional(),
    DAILY_REPORT_EMAIL_RECIPIENTS: z.string().optional(),
    BETTER_STACK_HEARTBEAT_NIGHTLY_SALES: z.string().url().optional(),
    BETTER_STACK_HEARTBEAT_MEMBERSHIP_EXPIRY: z.string().url().optional(),
    BETTER_STACK_HEARTBEAT_SESSION_CLEANUP: z.string().url().optional(),
    BETTER_STACK_HEARTBEAT_PREPROD_SYNC: z.string().url().optional(),
    BETTER_STACK_HEARTBEAT_REMINDERS: z.string().url().optional(),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.string().url(),
    NEXT_PUBLIC_ABLY_KEY: z.string().min(1),
    NEXT_PUBLIC_META_PIXEL_ID: z.string().min(1),
    NEXT_PUBLIC_POSTHOG_KEY: z.string().startsWith('phc_'),
    NEXT_PUBLIC_POSTHOG_HOST: z.string().url(),
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().min(1),
  },
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    BETTER_AUTH_API_KEY: process.env.BETTER_AUTH_API_KEY,
    GOOGLE_OAUTH_CLIENT_ID: process.env.GOOGLE_OAUTH_CLIENT_ID,
    GOOGLE_OAUTH_CLIENT_SECRET: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    ABLY_PRIVATE_KEY: process.env.ABLY_PRIVATE_KEY,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
    R2_BUCKET_NAME: process.env.R2_BUCKET_NAME,
    META_PIXEL_ACCESS_TOKEN: process.env.META_PIXEL_ACCESS_TOKEN,
    QSTASH_TOKEN: process.env.QSTASH_TOKEN,
    QSTASH_CURRENT_SIGNING_KEY: process.env.QSTASH_CURRENT_SIGNING_KEY,
    QSTASH_NEXT_SIGNING_KEY: process.env.QSTASH_NEXT_SIGNING_KEY,
    VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
    VAPID_SUBJECT: process.env.VAPID_SUBJECT,
    SLACK_WEBHOOK_URL: process.env.SLACK_WEBHOOK_URL,
    DAILY_REPORT_EMAIL_RECIPIENTS: process.env.DAILY_REPORT_EMAIL_RECIPIENTS,
    BETTER_STACK_HEARTBEAT_NIGHTLY_SALES: process.env.BETTER_STACK_HEARTBEAT_NIGHTLY_SALES,
    BETTER_STACK_HEARTBEAT_MEMBERSHIP_EXPIRY: process.env.BETTER_STACK_HEARTBEAT_MEMBERSHIP_EXPIRY,
    BETTER_STACK_HEARTBEAT_SESSION_CLEANUP: process.env.BETTER_STACK_HEARTBEAT_SESSION_CLEANUP,
    BETTER_STACK_HEARTBEAT_PREPROD_SYNC: process.env.BETTER_STACK_HEARTBEAT_PREPROD_SYNC,
    BETTER_STACK_HEARTBEAT_REMINDERS: process.env.BETTER_STACK_HEARTBEAT_REMINDERS,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_ABLY_KEY: process.env.NEXT_PUBLIC_ABLY_KEY,
    NEXT_PUBLIC_META_PIXEL_ID: process.env.NEXT_PUBLIC_META_PIXEL_ID,
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
})
