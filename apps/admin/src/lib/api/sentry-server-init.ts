/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : sentry-server-init (admin)
 * Scope        : API Infrastructure / Observability
 *
 * Description  : Bootstraps the server/edge Sentry SDK on first server use,
 *                replacing the server-side Sentry.init() that the (now deleted)
 *                root instrumentation.ts used to trigger via register().
 *
 * WHY THIS EXISTS (and why instrumentation.ts is intentionally absent):
 *   The root instrumentation.ts in apps/admin was DELETED because OpenNext's
 *   build (trace-copy of instrumentation.js into the nested standalone output)
 *   breaks on it. Removing it also removed the server + edge `Sentry.init()`
 *   that `register()` performed (by importing sentry.server.config.ts /
 *   sentry.edge.config.ts) and the `onRequestError = Sentry.captureRequestError`
 *   hook — so server/edge unhandled errors stopped being captured.
 *
 *   DO NOT recreate a root instrumentation.ts (it re-breaks the OpenNext build).
 *   Instead, server error capture is restored through the API error-handler
 *   path: error-handler.ts imports this module, which runs Sentry.init() once
 *   on first server use and then captures unexpected errors via
 *   Sentry.captureException() in the handler's 500 branch.
 *
 * Responsibilities :
 * - Run Sentry.init() exactly once per server runtime (module singleton)
 * - Select the correct config by runtime (Node vs edge) so the Node SDK never
 *   loads on the edge and vice versa
 *
 * Notes        : The imported config files are themselves guarded — they are a
 *                no-op without a DSN (admin DSN comes from @/env) and only
 *                enabled in production — so importing them here is safe in every
 *                environment. The dynamic import is deliberately runtime-gated
 *                and not awaited: it resolves during module evaluation (route
 *                load / cold start), well before any request throws.
 ************************************************************/

// `process.env.NEXT_RUNTIME` is 'nodejs' or 'edge' on the server and undefined
// in non-Next contexts (e.g. unit tests), where this is a safe no-op.
const runtime = process.env.NEXT_RUNTIME

if (runtime === 'nodejs') {
  // Node.js server runtime → server config (full Node Sentry SDK).
  void import('../../../sentry.server.config')
} else if (runtime === 'edge') {
  // Edge runtime (middleware, edge route handlers) → edge config.
  void import('../../../sentry.edge.config')
}
