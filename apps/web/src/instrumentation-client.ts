/************************************************************
 * Module Name  : instrumentation-client
 * Scope        : Observability
 *
 * Description  : Browser Sentry init, run by Next.js before hydration. Replaces
 *                the root sentry.client.config.ts, which Turbopack production
 *                builds never load (so the browser SDK was silently absent in
 *                every deployed build).
 *
 * Notes        :
 * - The SDK is fetched with a dynamic import only when NEXT_PUBLIC_SENTRY_DSN
 *   was set at build time. Without a DSN the chunk is never requested, so an
 *   unconfigured integration costs visitors nothing (Lighthouse >= 95 budget).
 * - Lazy loading means errors thrown before the chunk arrives are not
 *   reported. Acceptable here; import the SDK statically instead if early
 *   capture ever matters more than the bundle budget.
 * - Monitoring must never break the page, so a failed chunk download (offline,
 *   blocked by an extension) is swallowed and simply leaves Sentry off.
 ************************************************************/

import type * as SentrySdk from '@sentry/nextjs'
import { sentryDataCollection } from '@/lib/sentry/data-collection'

let sentry: typeof SentrySdk | undefined

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

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
        dataCollection: sentryDataCollection,
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
