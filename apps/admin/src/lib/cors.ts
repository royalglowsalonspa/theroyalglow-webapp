/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : cors
 * Scope        : Admin CORS origin reflection (pure)
 *
 * Description  : Pure, I/O-free CORS helper for the admin portal. It reflects
 *                `Access-Control-Allow-Origin` ONLY when the request `Origin`
 *                EXACTLY equals the single allowed admin origin
 *                (`https://admin.theroyalglow.in`); for every other origin it
 *                returns NO `Access-Control-Allow-Origin` entry at all.
 *
 * Responsibilities :
 * - Decide whether a request origin is the allowed admin origin (exact match)
 * - Produce the CORS header map for a response (allow-origin reflected or omitted)
 *
 * Notes        : The core `corsHeaders(allowedOrigin, requestOrigin)` is PURE —
 *                no `process.env`, no `fetch`, no framework deps — so it can be
 *                property-tested with fast-check (Property P5, task 10.3). The
 *                thin `adminCorsHeaders(requestOrigin)` wrapper reads the allowed
 *                origin from the environment and delegates to the pure core.
 *
 * Requirements : 7.1, 7.2
 ************************************************************/

/**
 * The single allowed admin origin. Derived from the admin app URL env var with a
 * production fallback. Read once at module load; the pure core never touches env.
 */
export const ADMIN_ORIGIN = process.env.NEXT_PUBLIC_APP_URL ?? 'https://admin.theroyalglow.in'

/**
 * Pure CORS decision: returns `true` iff `requestOrigin` EXACTLY equals
 * `allowedOrigin`. A null/undefined/empty or mismatched origin is rejected.
 */
export function isAllowedOrigin(
  allowedOrigin: string,
  requestOrigin: string | null | undefined,
): boolean {
  return requestOrigin != null && requestOrigin === allowedOrigin
}

/**
 * Pure CORS header builder (Property P5 target — task 10.3).
 *
 * Returns `{ 'Access-Control-Allow-Origin': allowedOrigin }` ONLY when the
 * request origin EXACTLY equals `allowedOrigin`; otherwise returns an empty
 * object so NO `Access-Control-Allow-Origin` header is emitted (Req 7.1, 7.2).
 *
 * No I/O — deterministic in its two string arguments so it is property-testable.
 */
export function corsHeaders(
  allowedOrigin: string,
  requestOrigin: string | null | undefined,
): Record<string, string> {
  if (!isAllowedOrigin(allowedOrigin, requestOrigin)) {
    return {}
  }

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    Vary: 'Origin',
  }
}

/**
 * Thin env-reading wrapper around the pure {@link corsHeaders} core. Uses the
 * module-level {@link ADMIN_ORIGIN} as the allowed origin so callers (API
 * routes, middleware) only pass the incoming request `Origin` header value.
 */
export function adminCorsHeaders(requestOrigin: string | null | undefined): Record<string, string> {
  return corsHeaders(ADMIN_ORIGIN, requestOrigin)
}
