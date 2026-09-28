/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : sentry/edge (admin)
 * Scope        : Observability
 *
 * Description  : Sentry initialization for the admin app edge runtime
 *                (middleware, edge route handlers), reporting to the SEPARATE
 *                admin Sentry project. Loaded once per runtime by
 *                src/lib/api/sentry-server-init.ts.
 *
 * Responsibilities :
 * - Initialize the Sentry SDK on the edge runtime when a DSN is configured
 * - Tag events with environment and release metadata
 *
 * Tech Stack   : @sentry/nextjs
 * Layer        : Infrastructure (Observability)
 *
 * Dependencies : @sentry/nextjs, @/env
 *
 * Notes        : DSN comes from the admin env (NEXT_PUBLIC_ADMIN_SENTRY_DSN) which
 *                points at the dedicated admin Sentry project — NOT the web DSN.
 *                Lives under src/ on purpose: @sentry/nextjs warns about root
 *                sentry.edge.config.ts files that no instrumentation.ts
 *                imports, and this app cannot have one (it breaks OpenNext).
 ************************************************************/

import * as Sentry from '@sentry/nextjs'
import { env } from '@/env'
import { sentryDataCollection } from './data-collection'

const dsn = env.NEXT_PUBLIC_ADMIN_SENTRY_DSN
const release = process.env.COMMIT_SHA

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.APP_ENV ?? process.env.NODE_ENV ?? 'development',
    ...(release ? { release } : {}),
    tracesSampleRate: 0.1,
    enabled: process.env.NODE_ENV === 'production',
    dataCollection: sentryDataCollection,
  })
}
