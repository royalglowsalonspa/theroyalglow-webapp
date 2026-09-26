/************************************************************
 * Module Name  : sentry/server
 * Scope        : Observability
 *
 * Description  : Node.js server Sentry init. Loaded once per runtime by
 *                src/lib/api/sentry-server-init.ts; a no-op without
 *                NEXT_PUBLIC_SENTRY_DSN, and disabled outside production.
 *
 * Notes        : Lives under src/ on purpose. @sentry/nextjs warns about
 *                root-level sentry.server.config.ts files because it expects
 *                them to be imported from a root instrumentation.ts, which
 *                this app cannot have (it breaks the OpenNext trace-copy).
 ************************************************************/

import * as Sentry from '@sentry/nextjs'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN
const release = process.env.COMMIT_SHA

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.APP_ENV ?? process.env.NODE_ENV ?? 'development',
    ...(release ? { release } : {}),
    tracesSampleRate: 0.1,
    enabled: process.env.NODE_ENV === 'production',
    sendDefaultPii: false,
  })
}
