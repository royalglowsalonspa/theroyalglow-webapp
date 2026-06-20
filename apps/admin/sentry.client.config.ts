/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : sentry.client.config (admin)
 * Scope        : Observability
 *
 * Description  : Sentry initialization for the admin app browser runtime,
 *                reporting to the SEPARATE admin Sentry project.
 *
 * Responsibilities :
 * - Initialize the Sentry SDK on the client when a DSN is configured
 * - Tag events with environment and release metadata
 * - Disable session/error replays (admin is a private, low-traffic surface)
 *
 * Tech Stack   : @sentry/nextjs
 * Layer        : Infrastructure (Observability)
 *
 * Dependencies : @sentry/nextjs, @/env
 *
 * Notes        : DSN comes from the admin env (NEXT_PUBLIC_SENTRY_DSN) which
 *                points at the dedicated admin Sentry project — NOT the web DSN.
 ************************************************************/

import { env } from '@/env'
import * as Sentry from '@sentry/nextjs'

const dsn = env.NEXT_PUBLIC_SENTRY_DSN
const release = process.env.COMMIT_SHA

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.APP_ENV ?? process.env.NODE_ENV ?? 'development',
    ...(release ? { release } : {}),
    tracesSampleRate: 0.1,
    enabled: process.env.NODE_ENV === 'production',
    sendDefaultPii: false,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  })
}
