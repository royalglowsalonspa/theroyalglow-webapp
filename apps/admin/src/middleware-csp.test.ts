// @vitest-environment node
/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : middleware-csp.test
 * Scope        : Unit test for the per-request CSP nonce on the allow branch
 *
 * Description  : Vitest unit test for the admin edge middleware
 *                (`apps/admin/src/middleware.ts`) allow branch. With the
 *                session lookup mocked to return a sufficiently-privileged,
 *                valid session, the middleware must forward the request and
 *                attach a per-request Content-Security-Policy carrying
 *                `default-src 'self'` and a `script-src 'self' 'nonce-…'`
 *                source expression (Req 7.3).
 *
 * Notes        : Runs in the `node` environment. `global.fetch` is stubbed so
 *                the same-origin /api/auth/get-session lookup resolves to a
 *                valid owner session without any network call.
 *                _Requirements: 7.3_
 ************************************************************/

import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { middleware } from './middleware'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

function makeAuthorizedRequest(path: string): NextRequest {
  return new NextRequest(`https://admin.theroyalglow.in${path}`, {
    headers: { cookie: 'better-auth.session_token=valid-token' },
  })
}

function stubValidSession(role: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ user: { role } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    ),
  )
}

describe('admin middleware — CSP nonce on the allow branch (Req 7.3)', () => {
  it('attaches a Content-Security-Policy with default-src self and a script-src nonce', async () => {
    stubValidSession('owner') // level 4 >= /bookings min (2) → allow

    const res = await middleware(makeAuthorizedRequest('/bookings'))

    const csp = res.headers.get('Content-Security-Policy')
    expect(csp).toBeTruthy()
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("script-src 'self' 'nonce-")
  })

  it('issues a distinct nonce per request', async () => {
    stubValidSession('owner')

    const res1 = await middleware(makeAuthorizedRequest('/bookings'))
    const res2 = await middleware(makeAuthorizedRequest('/bookings'))

    const csp1 = res1.headers.get('Content-Security-Policy')
    const csp2 = res2.headers.get('Content-Security-Policy')
    expect(csp1).toBeTruthy()
    expect(csp2).toBeTruthy()
    // Per-request nonce → the two CSP strings must differ.
    expect(csp1).not.toBe(csp2)
  })

  // Regression guard: the brand fonts (Cabinet Grotesk + Clash Grotesk from
  // Fontshare, Plus Jakarta Sans from Google) load via @import in globals.css.
  // The strict admin CSP MUST permit those CDN origins (stylesheet hosts in
  // style-src, font-file hosts in font-src) or the portal renders in a fallback
  // system font under the real auth flow. If anyone drops these, this fails.
  it('permits the brand font CDN origins so the typography is never blocked', async () => {
    stubValidSession('owner')

    const csp = (await middleware(makeAuthorizedRequest('/bookings'))).headers.get(
      'Content-Security-Policy',
    )

    expect(csp).toBeTruthy()
    // Stylesheet hosts (the @import targets).
    expect(csp).toContain('style-src')
    expect(csp).toContain('https://fonts.googleapis.com')
    expect(csp).toContain('https://api.fontshare.com')
    // Font-file hosts (the @font-face src targets).
    expect(csp).toContain('font-src')
    expect(csp).toContain('https://fonts.gstatic.com')
    expect(csp).toContain('https://cdn.fontshare.com')
  })
})

describe('admin middleware — diagnostic logging', () => {
  it('keeps a forged pathname inside one quoted log field on a single line', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('ADMIN_DEV_BYPASS_AUTH', '')
    vi.stubEnv('ADMIN_DEV_IMPERSONATE_EMAIL', '')
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const request = new NextRequest('https://admin.theroyalglow.in/bookings')
    // Inject raw controls at the middleware boundary, before URL encoding can hide them.
    vi.spyOn(request.nextUrl, 'pathname', 'get').mockReturnValue(
      '/bookings\r\n[admin-mw]\u2028\u2029 "state=valid"\t\u001b',
    )

    const response = await middleware(request)

    expect(response.status).toBe(307)
    expect(log).toHaveBeenCalledOnce()
    const entry = log.mock.calls[0]?.[0]
    for (const control of ['\r', '\n', '\u2028', '\u2029', '\t', '\u001b']) {
      expect(entry).not.toContain(control)
    }
    expect(entry).toContain('path="/bookings[admin-mw] \\"state=valid\\"\\t\\u001b"')
    expect(entry).toContain('state=no_cookie')
  })
})
