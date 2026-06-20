/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : instrumentation (admin)
 * Scope        : Observability
 *
 * Description  : Next.js instrumentation hook that initializes Sentry for the
 *                admin app on the appropriate runtime (Node.js / edge) and
 *                forwards request errors to Sentry.
 *
 * Responsibilities :
 * - Load the Node.js Sentry config on the server runtime
 * - Load the edge Sentry config on the edge runtime
 * - Re-export captureRequestError as the onRequestError hook
 *
 * Tech Stack   : Next.js 16, @sentry/nextjs
 * Layer        : Infrastructure (Observability)
 *
 * Dependencies : @sentry/nextjs, ./sentry.server.config, ./sentry.edge.config
 *
 * Notes        : Points at the SEPARATE admin Sentry project (its DSN comes
 *                from NEXT_PUBLIC_SENTRY_DSN in the admin env — never the web DSN).
 ************************************************************/

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

export { captureRequestError as onRequestError } from '@sentry/nextjs'
