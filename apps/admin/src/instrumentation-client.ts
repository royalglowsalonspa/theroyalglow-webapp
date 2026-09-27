/************************************************************
 * Module Name  : instrumentation-client (admin)
 * Scope        : Observability
 *
 * Description  : Browser Sentry init for the admin portal, run by Next.js
 *                before hydration and reporting to the SEPARATE admin Sentry
 *                project. Replaces the root sentry.client.config.ts, which
 *                Turbopack production builds never load.
 *
 * Notes        :
 * - Reads NEXT_PUBLIC_ADMIN_SENTRY_DSN from process.env (inlined at build time)
 *   rather than importing @/env: this file runs before hydration, and pulling
 *   the env schema and its validator into that path would cost every page load
 *   for an optional integration. The server still validates the DSN via @/env.
 * - The SDK is fetched with a dynamic import only when the DSN is set, so an
 *   unconfigured integration adds nothing to the page.
 * - Lazy loading means errors thrown before the chunk arrives are not reported.
 * - A failed chunk download is swallowed: monitoring must never break the page.
 ************************************************************/

import type * as SentrySdk from '@sentry/nextjs'

let sentry: typeof SentrySdk | undefined

const dsn = process.env.NEXT_PUBLIC_ADMIN_SENTRY_DSN

if (dsn) {
  void import('@sentry/nextjs')
    .then((Sentry) => {
      const release = process.env.COMMIT_SHA
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
      sentry = Sentry
    })
    .catch(() => undefined)
}

// Navigation spans for App Router transitions. A no-op until the SDK chunk
// has loaded (and always, when no DSN is configured).
export function onRouterTransitionStart(
  href: string,
  navigationType: 'push' | 'replace' | 'traverse',
): void {
  sentry?.captureRouterTransitionStart(href, navigationType)
}
