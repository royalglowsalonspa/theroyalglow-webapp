/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : middleware
 * Scope        : Security Perimeter (Edge) — CSP nonce + Auth/Authorization
 *
 * Description  : Edge-compatible middleware for the PUBLIC customer site. It
 *                does two jobs on every document request:
 *                  1. Stamps a per-request, nonce-based Content-Security-Policy
 *                     onto the response (and forwards the nonce to the document
 *                     so Next.js stamps its own scripts) — mirroring the admin
 *                     portal's nonce CSP, but with an allowlist tuned for the
 *                     third-party SDKs THIS site actually loads.
 *                  2. Preserves the existing auth/redirect behaviour: legacy
 *                     /admin and /staff 301 redirects, and the session-cookie
 *                     gate on protected customer routes.
 *
 * Responsibilities :
 * - Generate an edge-safe per-request CSP nonce (Web Crypto, no node:crypto)
 * - Build the customer-site CSP allowlist (PostHog, Meta Pixel, Clarity,
 *   Google One Tap/OAuth, Ably, R2/CMS images, Sentry) so the policy never
 *   breaks the live site
 * - Permanently (301) redirect legacy /admin/* and /staff/* paths
 * - Redirect unauthenticated visitors away from protected customer routes
 *
 * Tech Stack   : Next.js 16 Middleware, Edge / Cloudflare Workers runtime
 * Layer        : Infrastructure (Edge)
 *
 * Dependencies : next/server, ./lib/admin-redirect, ./lib/staff-redirect
 *
 * Notes        :
 * - Better Auth's auth-server cannot be imported here (kysely incompatible with
 *   Edge); we only inspect the session cookie's presence.
 * - Runs on the Workers runtime: only Web APIs are used (crypto.getRandomValues,
 *   btoa) — NO Node-only built-ins.
 *
 * ── CSP design / tradeoffs (documented per task) ──────────────────────────
 * This is a PUBLIC marketing site that loads first-party Next.js bundles AND
 * several third-party SDKs that inject their own <script> tags at runtime
 * (Meta Pixel → connect.facebook.net, Microsoft Clarity → clarity.ms, Google
 * One Tap → accounts.google.com/gsi, PostHog). A pure `script-src 'self'
 * 'nonce-…'` (as used by the admin portal, which loads NO third-party SDKs)
 * would BLOCK those SDK scripts and break analytics/sign-in.
 *
 * We therefore use the industry-standard "strict-dynamic with backwards-compat
 * fallbacks" recipe for `script-src`:
 *     'self' 'nonce-<n>' 'strict-dynamic' https: 'unsafe-inline'
 *   • Next.js auto-applies the nonce to its own bundle scripts (it reads the
 *     CSP nonce from the request header we set below).
 *   • 'strict-dynamic' lets those trusted (nonce'd) bundle scripts load the SDK
 *     scripts they inject via document.createElement — so the SDKs work WITHOUT
 *     us having to allowlist every vendor script host.
 *   • In CSP3 browsers 'strict-dynamic' makes `https:` and 'unsafe-inline' be
 *     IGNORED for scripts (so they do not weaken the policy); they exist only
 *     as graceful fallbacks for older CSP1/CSP2 engines. This is the documented
 *     Google web.dev strict-CSP pattern.
 * Tradeoff: we accept the `https:`/'unsafe-inline' fallback (a no-op on modern
 * browsers) in exchange for never breaking the SDKs or older clients. The nonce
 * + strict-dynamic path is the one that actually governs modern browsers.
 *
 * `style-src` keeps 'unsafe-inline' because Tailwind/Next/Google GSI all emit
 * inline styles and there is no nonce path for injected <style>; inline styles
 * cannot exfiltrate data, so this is a low-risk, deliberate allowance.
 *
 * `img-src` allows `https:` (+ data:/blob:) because the site pulls images from
 * many hosts (R2 CDN, CMS, Unsplash, Google avatars, tracking pixels); images
 * are inert, so a broad image policy does not create script-execution risk.
 *
 * Connect/frame/font sources ARE explicitly allowlisted (these govern data
 * exfiltration and framing, the higher-risk surfaces).
 ************************************************************/

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { mapAdminRedirect } from './lib/admin-redirect'
import { mapStaffRedirect } from './lib/staff-redirect'

// Better Auth session cookie name (shared scope `.theroyalglow.in`).
const SESSION_COOKIE = 'better-auth.session_token'

/**
 * Protected customer route prefixes. The session-cookie gate applies ONLY to
 * these (preserving the previous matcher's scope) — every other page is public
 * and must NOT be redirected just because the middleware now runs site-wide to
 * stamp the CSP.
 */
const PROTECTED_PREFIXES = ['/onboarding', '/profile', '/bookings', '/membership', '/gems']

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
}

/**
 * Generate an edge-safe, per-request CSP nonce using Web Crypto
 * (`crypto.getRandomValues`), available on the Edge / Workers runtime —
 * Node-only APIs (e.g. `crypto.randomBytes`) must NOT be used here. The 16
 * random bytes are base64-encoded to form the `'nonce-…'` source value.
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
 * Build the customer-site Content-Security-Policy for a given nonce. See the
 * file header for the full rationale behind each directive. `isDev` relaxes the
 * policy for the Next.js/Turbopack dev server (eval + websocket HMR) without
 * affecting the production policy.
 */
function buildCsp(nonce: string, isDev: boolean): string {
  // script-src: nonce + strict-dynamic is the policy that governs modern
  // browsers; `https:` and 'unsafe-inline' are CSP1/2 fallbacks (ignored when
  // strict-dynamic is honoured). Dev additionally needs 'unsafe-eval' for
  // Turbopack's dev tooling.
  const scriptSrc = [
    "script-src 'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    'https:',
    "'unsafe-inline'",
    isDev ? "'unsafe-eval'" : '',
  ]
    .filter(Boolean)
    .join(' ')

  // connect-src: first-party + the exact backends the browser talks to.
  const connectSrc = [
    "connect-src 'self'",
    // PostHog (analytics + feature flags) — US/EU clouds + any subdomain.
    'https://*.posthog.com',
    'https://app.posthog.com',
    // Meta Pixel beacon endpoints.
    'https://connect.facebook.net',
    'https://www.facebook.com',
    // Microsoft Clarity ingest.
    'https://*.clarity.ms',
    'https://c.bing.com',
    // Google One Tap / OAuth (GSI + FedCM).
    'https://accounts.google.com',
    // Ably realtime (REST + WebSocket).
    'https://*.ably.io',
    'wss://*.ably.io',
    'https://*.ably-realtime.com',
    'wss://*.ably-realtime.com',
    // Sentry error ingestion (DSN-derived ingest hosts).
    'https://*.ingest.sentry.io',
    'https://*.ingest.us.sentry.io',
    'https://*.ingest.de.sentry.io',
    // Dev: Turbopack HMR websocket + local origins.
    isDev ? 'ws:' : '',
    isDev ? 'http://localhost:*' : '',
  ]
    .filter(Boolean)
    .join(' ')

  // frame-src: consent/sign-in surfaces that legitimately iframe, plus the
  // Google Maps embed on the contact page (served from www.google.com /
  // maps.google.com).
  const frameSrc =
    "frame-src 'self' https://accounts.google.com https://www.facebook.com https://www.google.com https://maps.google.com"

  // font-src: next/font self-hosts; data: covers inline fonts; gstatic for GSI.
  // Brand fonts — Cabinet Grotesk + Clash Grotesk (Fontshare) and Plus Jakarta
  // Sans (Google Fonts) — are loaded via `@import url(...)` in styles/globals.css.
  // The stylesheet hosts must be allowed in `style-src` and the font-FILE hosts in
  // `font-src`, otherwise the CSP blocks them and the customer site silently
  // renders in a fallback system font. This mirrors the identical allowance in
  // apps/admin/src/middleware.ts.
  const fontSrc =
    "font-src 'self' data: https://fonts.gstatic.com https://api.fontshare.com https://cdn.fontshare.com"

  // style-src: 'unsafe-inline' is a deliberate, low-risk allowance (see header).
  const styleSrc =
    "style-src 'self' 'unsafe-inline' https://accounts.google.com https://fonts.googleapis.com https://api.fontshare.com"

  // img-src: inert content from many hosts — broad https: is acceptable.
  const imgSrc = "img-src 'self' data: blob: https:"

  return [
    "default-src 'self'",
    scriptSrc,
    styleSrc,
    imgSrc,
    fontSrc,
    connectSrc,
    frameSrc,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://accounts.google.com",
    "frame-ancestors 'none'",
  ].join('; ')
}

/**
 * Forward the request with an injected `x-nonce` header and attach the
 * per-request CSP response header. Next.js reads the nonce from the request's
 * `Content-Security-Policy` header to stamp its own framework `<script>` tags;
 * server components can read `x-nonce` (via `headers()`) for any first-party
 * inline scripts.
 */
function allowWithCspNonce(request: NextRequest): NextResponse {
  const nonce = generateNonce()
  const isDev = process.env.NODE_ENV !== 'production'
  const csp = buildCsp(nonce, isDev)

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', csp)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('Content-Security-Policy', csp)
  return response
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  // Legacy admin paths permanently moved to admin.theroyalglow.in. Redirect
  // FIRST (before any session/CSP logic) so it applies to unauthenticated users
  // too, and emit a strict 301 (permanent) preserving the sub-path + query.
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    return NextResponse.redirect(mapAdminRedirect(pathname, search), 301)
  }

  // Legacy staff self-service paths moved to the admin subdomain's `/me/*`
  // namespace during the admin-web-separation feature. Redirect FIRST; 301
  // (permanent), preserving the sub-path + query.
  if (pathname === '/staff' || pathname.startsWith('/staff/')) {
    return NextResponse.redirect(mapStaffRedirect(pathname, search), 301)
  }

  // Session-cookie gate — ONLY on protected customer routes. Unauthenticated →
  // redirect to the homepage, where Google One Tap and the explicit "Sign in"
  // button live (there is no dedicated /sign-in page). Public pages fall
  // through to the CSP stamp below.
  if (isProtectedPath(pathname)) {
    const sessionToken = request.cookies.get(SESSION_COOKIE)?.value
    if (!sessionToken) {
      const homeUrl = new URL('/', request.url)
      return NextResponse.redirect(homeUrl)
    }
  }

  // Public page or authenticated protected page → forward with the per-request
  // nonce CSP attached.
  return allowWithCspNonce(request)
}

export const config = {
  // Run on all document routes so the CSP is stamped site-wide. Excludes API
  // routes (CORS is handled per-route; JSON responses need no CSP), Next.js
  // build assets, and the favicon. The auth gate inside `middleware` is itself
  // scoped to PROTECTED_PREFIXES, so running site-wide does not over-redirect.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
