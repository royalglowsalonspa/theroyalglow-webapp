import { getCookieCache } from 'better-auth/cookies'
/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : middleware
 * Scope        : Authentication & Authorization (Edge)
 *
 * Description  : Edge-compatible middleware for the admin portal. It is the
 *                thin I/O edge wrapper around the pure RBAC decision core in
 *                `lib/rbac.ts`. It reads the Better Auth session cookie, looks
 *                up the session via the admin's OWN /api/auth/get-session
 *                (same-origin, cookie forwarded), classifies the result into an
 *                `AuthState`, computes the route minimum level, asks `decide`
 *                for an action, and renders the matching `NextResponse`.
 *
 * Responsibilities :
 * - Classify the session lookup into AuthState (no_cookie / invalid / error / valid)
 * - Compute routeMin via routeMinLevel and delegate the decision to `decide`
 * - Render redirect / clear-cookie+redirect / 403 / next responses
 *
 * Features / Functionality :
 * - Lightweight edge-safe session check (no kysely/DB imports — fetch only)
 * - Unauthenticated / invalid / error → bounce to the customer site
 * - Insufficient role → 403 (no redirect); sufficient role → forward request
 *
 * Tech Stack   : Next.js 16 Middleware, Edge Runtime
 * Layer        : Infrastructure (Edge)
 *
 * Dependencies : next/server, ./lib/rbac (pure, no I/O)
 *
 * Notes        :
 * - Better Auth's auth-server cannot be imported here (kysely incompatible with Edge)
 * - The admin app renders no sign-in; unauthenticated visitors are redirected to
 *   the customer domain where Google One Tap / sign-in lives (Req 4.7)
 * - CSP nonce injection (task 10.1): on the `allow` branch a per-request nonce
 *   is generated (edge-safe Web Crypto), forwarded to the document via the
 *   `x-nonce` request header, and attached as the `Content-Security-Policy`
 *   response header so only scripts carrying the nonce execute (Req 7.3).
 * - Requirements: 4.3, 4.4, 4.5, 4.6, 5.2, 5.5, 5.6, 7.3
 ************************************************************/
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { type AuthState, decide, resolveRoleLevel, routeMinLevel } from './lib/rbac'

/** Better Auth session cookie name (shared scope `.theroyalglow.in`). */
const SESSION_COOKIE = 'better-auth.session_token'

/**
 * Better Auth prefixes the cookie name with `__Secure-` whenever it issues a
 * secure cookie — which it does over https (production, `admin.theroyalglow.in`
 * / `theroyalglow.in`). So the real production cookie name is
 * `__Secure-better-auth.session_token`, while local dev (http) uses the bare
 * name. Better Auth's own readers try BOTH names; this middleware must do the
 * same or it sees `no_cookie` in production and bounces every authenticated
 * admin straight back to the customer site. (better-auth/cookies, v1.6.x.)
 */
const SECURE_SESSION_COOKIE = `__Secure-${SESSION_COOKIE}`

/**
 * Customer-site origin to bounce unauthenticated / invalid / errored visitors
 * to (Req 4.7). Design specifies `https://theroyalglow.in`; for local dev the
 * origin can be overridden via `NEXT_PUBLIC_WEB_ORIGIN` so `localhost` works.
 */
const WEB_ORIGIN = process.env.NEXT_PUBLIC_WEB_ORIGIN ?? 'https://theroyalglow.in'

/**
 * Generate an edge-safe, per-request CSP nonce. Uses Web Crypto
 * (`crypto.getRandomValues`), which is available in the Next.js Edge runtime —
 * Node-only APIs (e.g. `crypto.randomBytes`) must not be used here. The 16 random
 * bytes are base64-encoded to produce the `'nonce-…'` source expression value.
 */
function generateNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

/**
 * Forward the request with an injected `x-nonce` header and attach the
 * per-request CSP response header (Req 7.3). The document/app reads `x-nonce`
 * (via `headers()`) to stamp the nonce onto its own `<script>` tags so only
 * nonce-carrying scripts execute under `script-src 'self' 'nonce-<nonce>'`.
 */
function allowWithCspNonce(request: NextRequest): NextResponse {
  const nonce = generateNonce()
  // In development, Next.js + Turbopack's React Server Components client uses
  // `eval()` for dev-only debugging (e.g. reconstructing cross-environment
  // callstacks), so the dev CSP must include `'unsafe-eval'`. Production keeps
  // the strict nonce-only policy with no eval (Req 7.3).
  const isDev = process.env.NODE_ENV !== 'production'
  const scriptSrc = isDev
    ? `script-src 'self' 'nonce-${nonce}' 'unsafe-eval'`
    : `script-src 'self' 'nonce-${nonce}'`

  // Brand fonts — Cabinet Grotesk + Clash Grotesk (Fontshare) and Plus Jakarta
  // Sans (Google Fonts) — are loaded via `@import url(...)` in globals.css.
  // Without explicit `style-src`/`font-src` they fall back to `default-src
  // 'self'`, which BLOCKS the external font stylesheets + font files, stripping
  // the brand typography so the portal renders in a fallback system font. Allow
  // exactly the font CDNs (stylesheet hosts in style-src, file hosts in
  // font-src) so the brand fonts load under the strict CSP in BOTH dev and prod.
  // `img-src` is declared so same-origin/optimised images and inline data/blob
  // URLs keep working once the explicit fetch directives are present.
  const styleSrc =
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://api.fontshare.com"
  const fontSrc =
    "font-src 'self' data: https://fonts.gstatic.com https://api.fontshare.com https://cdn.fontshare.com"
  const imgSrc = "img-src 'self' data: blob: https:"

  const csp = [`default-src 'self'`, scriptSrc, styleSrc, fontSrc, imgSrc].join('; ')

  // Inject the nonce onto the forwarded request headers so the app can read it.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', csp)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('Content-Security-Policy', csp)
  return response
}

/**
 * Resolve the session lookup into an `AuthState` (Req 4.3):
 * - no cookie            → { kind: 'no_cookie' }
 * - lookup non-2xx       → { kind: 'invalid' }
 * - lookup throws        → { kind: 'error' }
 * - lookup ok            → { kind: 'valid', roleLevel }
 *
 * Two-stage resolution:
 *  1. EDGE-NATIVE FAST PATH — verify Better Auth's signed `session_data` cache
 *     cookie locally with the shared secret (Web Crypto HMAC, no network, no
 *     DB). When it yields an admin role (level > 0) we allow immediately. This
 *     is the reliable path for the "just signed in on :3000, open the portal on
 *     :3001" flow and is immune to the self-fetch flakiness that previously
 *     bounced authenticated admins back to the customer site.
 *  2. DB-BACKED FALLBACK — when the cache cookie is absent/expired (its TTL is
 *     5 min) or resolved to a non-admin, defer to the admin's own
 *     /api/auth/get-session for the authoritative role.
 */
async function classify(request: NextRequest): Promise<AuthState> {
  // Prefix-tolerant read: production cookies carry the `__Secure-` prefix, local
  // dev cookies do not — mirror Better Auth's own dual-name lookup.
  const sessionToken =
    request.cookies.get(SESSION_COOKIE)?.value ?? request.cookies.get(SECURE_SESSION_COOKIE)?.value

  if (!sessionToken) {
    return { kind: 'no_cookie' }
  }

  // ── Stage 1: verify the signed session-cache cookie at the edge ──────────
  const secret = process.env.BETTER_AUTH_SECRET
  if (secret) {
    try {
      // The cache cookie is named `better-auth.session_data` over http (dev)
      // and `__Secure-better-auth.session_data` over https (prod). Try both
      // names so the same code path works in every environment.
      const cached =
        (await getCookieCache(request, { secret, isSecure: false })) ??
        (await getCookieCache(request, { secret, isSecure: true }))
      const cachedRole = (cached?.user as { role?: string } | undefined)?.role
      const cachedLevel = resolveRoleLevel(cachedRole)
      if (cached?.user && cachedLevel > 0) {
        return { kind: 'valid', roleLevel: cachedLevel }
      }
    } catch {
      // Verification failure (bad signature / version) → fall through to the
      // authoritative DB-backed lookup rather than failing the request here.
    }
  }

  // ── Stage 2: authoritative same-origin get-session (DB-backed) ───────────
  try {
    // Forward the FULL incoming cookie header so get-session sees the token
    // under whichever name the browser sent (bare or `__Secure-` prefixed) plus
    // the Better Auth cookie-cache cookie; fall back to a reconstructed pair if,
    // somehow, no raw cookie header is present.
    const cookieHeader = request.headers.get('cookie') ?? `${SESSION_COOKIE}=${sessionToken}`
    const sessionRes = await fetch(`${request.nextUrl.origin}/api/auth/get-session`, {
      headers: { cookie: cookieHeader },
    })

    if (!sessionRes.ok) {
      return { kind: 'invalid' }
    }

    const session = await sessionRes.json()
    // A 200 with no user means the token no longer maps to a live session
    // (expired / revoked) — treat it as invalid so the stale cookie is cleared.
    if (!session?.user) {
      return { kind: 'invalid' }
    }
    return { kind: 'valid', roleLevel: resolveRoleLevel(session.user.role) }
  } catch {
    // Network / server failure during the lookup — fail closed (Req 4.6, 5.6).
    return { kind: 'error' }
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ── LOCAL DEV ONLY — auth bypass / impersonation ───────────────────────
  // Skip the edge session/RBAC check when either:
  //   • ADMIN_DEV_BYPASS_AUTH=1   → view the portal with no session, or
  //   • ADMIN_DEV_IMPERSONATE_EMAIL is set → operate as a real user by email.
  // The edge runtime cannot reach the DB, so role-accurate enforcement for the
  // impersonation case happens server-side (requireRole / layout). Both are
  // gated on NODE_ENV !== production and can NEVER activate in a prod build.
  if (
    process.env.NODE_ENV !== 'production' &&
    (process.env.ADMIN_DEV_BYPASS_AUTH === '1' ||
      (process.env.ADMIN_DEV_IMPERSONATE_EMAIL ?? '').trim() !== '')
  ) {
    return NextResponse.next()
  }

  const state = await classify(request)
  const routeMin = routeMinLevel(pathname)
  const decision = decide(state, routeMin)

  // ── LOCAL DEV ONLY — diagnose the admin-access bounce ──────────────────
  // Prints exactly which AuthState branch fired and the resulting action to
  // the admin dev terminal, so a still-bouncing session can be pinned to a
  // concrete cause (no_cookie / invalid / error / forbid) instead of guessed.
  // Prod-gated: never logs in a production build.
  if (process.env.NODE_ENV !== 'production') {
    const hasBare = request.cookies.has(SESSION_COOKIE)
    const hasSecure = request.cookies.has(SECURE_SESSION_COOKIE)
    const roleLevel = state.kind === 'valid' ? state.roleLevel : 'n/a'
    console.log(
      `[admin-mw] ${pathname} state=${state.kind} roleLevel=${roleLevel} routeMin=${routeMin} action=${decision.action} cookie(bare=${hasBare},secure=${hasSecure})`,
    )
  }

  switch (decision.action) {
    case 'redirect':
      // No cookie or lookup error → bounce to the customer site (Req 4.4, 4.6, 5.5, 5.6).
      return NextResponse.redirect(WEB_ORIGIN)

    case 'clear_and_redirect': {
      // Invalid / expired session → clear the stale cookie(s), then redirect
      // (Req 4.5). Delete both the bare and `__Secure-` prefixed names so the
      // stale cookie is cleared in every environment.
      const response = NextResponse.redirect(WEB_ORIGIN)
      response.cookies.delete(SESSION_COOKIE)
      response.cookies.delete(SECURE_SESSION_COOKIE)
      return response
    }

    case 'forbid':
      // Valid session but insufficient role → 403, no redirect (Req 4.6, 5.2).
      return new NextResponse('Forbidden', { status: 403 })

    case 'allow':
      // Sufficient role → forward the request with a per-request CSP nonce
      // (Req 7.3). The nonce is injected on the request (`x-nonce`) for the app
      // to read and set as the Content-Security-Policy response header.
      return allowWithCspNonce(request)
  }
}

export const config = {
  // `api/jobs` is excluded because QStash posts with NO session cookie — the
  // RBAC middleware would otherwise redirect those webhooks to the customer
  // site. The job routes perform their own QStash HMAC verification
  // (verifyQStashSignature), so they are safe to exclude from RBAC.
  //
  // `logo.png` (and any other root static asset) is excluded so the
  // next/image optimiser can fetch the source file — otherwise the gate
  // redirects the image request and next/image receives a non-image response
  // ("isn't a valid image … received null").
  matcher: ['/((?!_next|favicon.ico|logo.png|api/health|api/auth|api/jobs).*)'],
}
