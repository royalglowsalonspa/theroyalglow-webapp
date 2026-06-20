// @vitest-environment node
/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : session-sharing.test
 * Scope        : Integration tests for cross-subdomain session sharing config
 *
 * Description  : Verifies the cookie / session-sharing CONTRACT that lets a
 *                session created on theroyalglow.in be recognised on
 *                admin.theroyalglow.in without re-authenticating — WITHOUT a live
 *                DB or real OAuth (neither is available in CI).
 *
 *                Strategy: both `auth-server.ts` files build their Better Auth
 *                `advanced` block from the shared pure helper
 *                `buildCrossSubdomainAdvanced` in `@rgss/business`. We assert the
 *                observable config contract on that helper, plus a lightweight
 *                source-level invariant that BOTH apps read the SAME
 *                `BETTER_AUTH_SECRET` env var (so tokens validate cross-app).
 *
 * Validates    : Requirements 4.1, 4.2, 4.8
 *
 * Notes        : Node environment (docblock above) since this touches server
 *                auth config and reads server source files. Append-only.
 ************************************************************/

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  type CrossSubdomainAdvanced,
  SHARED_COOKIE_DOMAIN,
  buildCrossSubdomainAdvanced,
  resolveCookieDomain,
} from '@rgss/business'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '../../../../')
const ADMIN_AUTH_SERVER = resolve(HERE, 'auth-server.ts')
const WEB_AUTH_SERVER = resolve(REPO_ROOT, 'apps/web/src/lib/auth-server.ts')

// Feature: admin-subdomain-migration — session sharing config contract
// Validates: Requirements 4.1, 4.2, 4.8

describe('session sharing: cross-subdomain cookie attributes (production)', () => {
  it('enables cross-subdomain cookies on the shared parent domain when NODE_ENV=production', () => {
    // Production path: no explicit COOKIE_DOMAIN, NODE_ENV=production.
    const advanced = buildCrossSubdomainAdvanced(undefined, 'production')

    expect(advanced.crossSubDomainCookies.enabled).toBe(true)
    // Narrow the union so `domain` is accessible.
    if (advanced.crossSubDomainCookies.enabled) {
      expect(advanced.crossSubDomainCookies.domain).toBe('.theroyalglow.in')
      expect(advanced.crossSubDomainCookies.domain).toBe(SHARED_COOKIE_DOMAIN)
    }
  })

  it('sets defaultCookieAttributes to SameSite=Lax; Secure; HttpOnly', () => {
    const advanced = buildCrossSubdomainAdvanced(undefined, 'production')

    // These three attributes + the resolved domain produce:
    // Set-Cookie: better-auth.session_token=…; Domain=.theroyalglow.in;
    //             SameSite=Lax; Secure; HttpOnly
    expect(advanced.defaultCookieAttributes).toEqual({
      sameSite: 'lax',
      secure: true,
      httpOnly: true,
    })
  })

  it('honours an explicit COOKIE_DOMAIN override (e.g. staging) regardless of NODE_ENV', () => {
    const advanced = buildCrossSubdomainAdvanced('.staging.theroyalglow.in', 'production')
    expect(advanced.crossSubDomainCookies.enabled).toBe(true)
    if (advanced.crossSubDomainCookies.enabled) {
      expect(advanced.crossSubDomainCookies.domain).toBe('.staging.theroyalglow.in')
    }

    // An explicit COOKIE_DOMAIN also wins in a non-production environment.
    const devOverride = buildCrossSubdomainAdvanced('.theroyalglow.in', 'development')
    expect(devOverride.crossSubDomainCookies).toEqual({
      enabled: true,
      domain: '.theroyalglow.in',
    })
  })
})

describe('session sharing: local-dev safety', () => {
  it('disables cross-subdomain cookies and sets no domain when not production and no COOKIE_DOMAIN', () => {
    for (const nodeEnv of ['development', 'test', undefined]) {
      const advanced = buildCrossSubdomainAdvanced(undefined, nodeEnv)

      // Disabled and — crucially — NO `domain` key (setting
      // Domain=.theroyalglow.in on localhost would break local sign-in).
      expect(advanced.crossSubDomainCookies).toEqual({ enabled: false })
      expect('domain' in advanced.crossSubDomainCookies).toBe(false)

      // Cookie attributes stay secure-by-default even in dev config shape.
      expect(advanced.defaultCookieAttributes).toEqual({
        sameSite: 'lax',
        secure: true,
        httpOnly: true,
      })
    }
  })

  it('resolveCookieDomain: domain iff production-or-override (property)', () => {
    fc.assert(
      fc.property(
        fc.option(fc.string(), { nil: undefined }),
        fc.constantFrom('production', 'development', 'test', undefined),
        (cookieDomainEnv, nodeEnv) => {
          const resolved = resolveCookieDomain(cookieDomainEnv, nodeEnv)
          if (cookieDomainEnv !== undefined) {
            // Explicit override always wins.
            expect(resolved).toBe(cookieDomainEnv)
          } else if (nodeEnv === 'production') {
            expect(resolved).toBe(SHARED_COOKIE_DOMAIN)
          } else {
            expect(resolved).toBeUndefined()
          }
        },
      ),
      { numRuns: 200 },
    )
  })
})

describe('session sharing: shared-secret invariant', () => {
  // Both apps MUST read the SAME BETTER_AUTH_SECRET so a token signed by one app
  // validates in the other. We can't read the runtime secret here (no env in
  // CI), so we assert the source-level contract: both auth configs reference the
  // BETTER_AUTH_SECRET env var as their `secret`, and both build their cookie
  // `advanced` block from the one shared helper.
  const adminSrc = readFileSync(ADMIN_AUTH_SERVER, 'utf8')
  const webSrc = readFileSync(WEB_AUTH_SERVER, 'utf8')

  it('both auth-server configs read BETTER_AUTH_SECRET from env', () => {
    expect(adminSrc).toMatch(/BETTER_AUTH_SECRET/)
    expect(webSrc).toMatch(/BETTER_AUTH_SECRET/)
    // Each passes that secret to betterAuth via the `secret:` option.
    expect(adminSrc).toMatch(/secret:\s*env\.BETTER_AUTH_SECRET/)
    expect(webSrc).toMatch(/secret:\s*process\.env\.BETTER_AUTH_SECRET/)
  })

  it('both apps build the cookie advanced block from the shared helper', () => {
    for (const src of [adminSrc, webSrc]) {
      expect(src).toMatch(
        /buildCrossSubdomainAdvanced\(\s*process\.env\.COOKIE_DOMAIN,\s*process\.env\.NODE_ENV,?\s*\)/,
      )
      expect(src).toMatch(/from '@rgss\/business'/)
    }
  })
})

// Compile-time guard: ensure the helper's return type stays the shape these
// tests assert against (kept as a type-only reference, no runtime cost).
const _typeGuard: CrossSubdomainAdvanced = buildCrossSubdomainAdvanced(undefined, 'production')
void _typeGuard
