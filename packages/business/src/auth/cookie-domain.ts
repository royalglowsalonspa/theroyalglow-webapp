/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : business/auth/cookie-domain
 * Scope        : Business Logic (pure)
 *
 * Description  : Pure helpers that derive the cross-subdomain cookie domain and
 *                build the Better Auth `advanced` config block shared by the
 *                customer app (theroyalglow.in) and the admin app
 *                (admin.theroyalglow.in). Keeping this logic here (no I/O, no
 *                framework deps) gives both `auth-server.ts` files ONE source of
 *                truth and makes the cookie/session-sharing contract unit
 *                testable without a live DB or OAuth.
 *
 * Responsibilities :
 * - Derive COOKIE_DOMAIN from env: explicit `COOKIE_DOMAIN`, else
 *   `.theroyalglow.in` in production, else undefined (local dev).
 * - Build the `advanced` block: enable cross-subdomain cookies only when a
 *   domain is resolved, set sameSite=lax / httpOnly always, and `secure` only
 *   when a shared domain is in effect (prod/https) so the session cookie is
 *   shareable across `*.theroyalglow.in` yet still works on local http (Req 4.1, 4.8).
 *
 * Tech Stack   : TypeScript
 * Layer        : Business Logic
 *
 * Dependencies : None (pure)
 *
 * Notes        : Functions take env values as ARGUMENTS (no `process.env` read)
 *                so they stay pure and deterministically testable.
 ************************************************************/

/**
 * The shared parent domain used in production so the Better Auth session cookie
 * is readable by every `*.theroyalglow.in` subdomain (the customer site and the
 * admin portal). The leading dot scopes the cookie to all subdomains.
 */
export const SHARED_COOKIE_DOMAIN = '.theroyalglow.in'

/**
 * The Better Auth `advanced` config shape produced by
 * {@link buildCrossSubdomainAdvanced}. Cross-subdomain cookies are enabled with
 * a concrete `domain` only when one is resolved; otherwise they are disabled and
 * no domain key is present (so local dev cookies stay host-only on `localhost`).
 */
export type CrossSubdomainAdvanced = {
  crossSubDomainCookies: { enabled: true; domain: string } | { enabled: false }
  defaultCookieAttributes: {
    sameSite: 'lax'
    secure: boolean
    httpOnly: true
  }
}

/**
 * Derive the cross-subdomain cookie domain from environment values.
 *
 * Precedence:
 * 1. An explicit `COOKIE_DOMAIN` env value always wins (lets staging/preview
 *    environments opt in or override).
 * 2. Otherwise, in production (`NODE_ENV === 'production'`) default to the shared
 *    parent domain `.theroyalglow.in`.
 * 3. Otherwise (local dev / test) return `undefined` so the cookie stays
 *    host-only — setting `Domain=.theroyalglow.in` on `localhost` would stop the
 *    browser storing the cookie and break local sign-in.
 *
 * @param cookieDomainEnv value of `process.env.COOKIE_DOMAIN` (or undefined)
 * @param nodeEnv value of `process.env.NODE_ENV` (or undefined)
 */
export function resolveCookieDomain(
  cookieDomainEnv: string | undefined,
  nodeEnv: string | undefined,
): string | undefined {
  return cookieDomainEnv ?? (nodeEnv === 'production' ? SHARED_COOKIE_DOMAIN : undefined)
}

/**
 * Build the Better Auth `advanced` block that controls cross-subdomain session
 * cookies. Used by BOTH `apps/web` and `apps/admin` so the customer site and the
 * admin portal emit an identical, shareable session cookie.
 *
 * When a domain is resolved (production / explicit `COOKIE_DOMAIN`):
 *   `crossSubDomainCookies = { enabled: true, domain }`
 * When no domain is resolved (local dev / test):
 *   `crossSubDomainCookies = { enabled: false }` (no domain key)
 *
 * `defaultCookieAttributes` is `{ sameSite: 'lax', secure: <domain !==
 * undefined>, httpOnly: true }` — `secure` is true only when a shared domain is
 * resolved (production / explicit COOKIE_DOMAIN, always https) and false in
 * local dev (http://localhost) so the cookie is not dropped. With a resolved
 * domain this yields:
 *   `Set-Cookie: …; Domain=.theroyalglow.in; SameSite=Lax; Secure; HttpOnly`
 * (Req 4.1, 4.8).
 *
 * @param cookieDomainEnv value of `process.env.COOKIE_DOMAIN` (or undefined)
 * @param nodeEnv value of `process.env.NODE_ENV` (or undefined)
 */
export function buildCrossSubdomainAdvanced(
  cookieDomainEnv: string | undefined,
  nodeEnv: string | undefined,
): CrossSubdomainAdvanced {
  const domain = resolveCookieDomain(cookieDomainEnv, nodeEnv)

  return {
    crossSubDomainCookies: domain !== undefined ? { enabled: true, domain } : { enabled: false },
    defaultCookieAttributes: {
      sameSite: 'lax',
      // `Secure` ONLY when a shared cross-subdomain domain is in effect
      // (production / explicit COOKIE_DOMAIN — always served over https). In
      // local dev there is no domain and both apps run on `http://localhost`,
      // where a `Secure` cookie is dropped by stricter browsers and by
      // non-localhost hosts (`127.0.0.1` / LAN IP). A dropped cookie means the
      // admin app never receives the session and bounces the user back to the
      // customer site — so gate `secure` off in dev to keep the cookie storable
      // and shared across the 3000 ↔ 3001 ports. In production `secure` is true,
      // which is also what makes Better Auth emit the `__Secure-` cookie name.
      secure: domain !== undefined,
      httpOnly: true,
    },
  }
}
