/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/web)
 * Module Name  : cors
 * Scope        : Web CORS origin reflection (pure)
 *
 * Description  : Pure, I/O-free CORS helper for the public customer site. It
 *                reflects `Access-Control-Allow-Origin` ONLY when the request
 *                `Origin` EXACTLY equals the site's own origin
 *                (`NEXT_PUBLIC_APP_URL`, e.g. `https://theroyalglow.in`); for
 *                every other origin it returns NO `Access-Control-Allow-Origin`
 *                entry at all. CORS is therefore NOT blanket-enabled — only the
 *                site's own first-party origin is allowed.
 *
 * Responsibilities :
 * - Decide whether a request origin is the site's own origin (exact match)
 * - Produce the CORS header map for a response (allow-origin reflected or omitted)
 *
 * Notes        : Mirrors apps/admin/src/lib/cors.ts. The core
 *                `corsHeaders(allowedOrigin, requestOrigin)` is PURE — no
 *                `process.env`, no `fetch`, no framework deps — so it is unit /
 *                property testable. The thin `webCorsHeaders(requestOrigin)`
 *                wrapper reads the allowed origin from the environment and
 *                delegates to the pure core.
 *
 *                Only API routes that genuinely serve cross-origin first-party
 *                callers need this — do not apply it indiscriminately.
 ************************************************************/

/**
 * The single allowed web origin. Derived from the public app URL env var with a
 * production fallback. Read once at module load; the pure core never touches env.
 */
export const WEB_ORIGIN = process.env.NEXT_PUBLIC_APP_URL ?? 'https://theroyalglow.in'

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
 * Pure CORS header builder.
 *
 * Returns `{ 'Access-Control-Allow-Origin': allowedOrigin, Vary: 'Origin' }`
 * ONLY when the request origin EXACTLY equals `allowedOrigin`; otherwise returns
 * an empty object so NO `Access-Control-Allow-Origin` header is emitted.
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
 * module-level {@link WEB_ORIGIN} as the allowed origin so callers (API routes)
 * only pass the incoming request `Origin` header value.
 */
export function webCorsHeaders(requestOrigin: string | null | undefined): Record<string, string> {
  return corsHeaders(WEB_ORIGIN, requestOrigin)
}
