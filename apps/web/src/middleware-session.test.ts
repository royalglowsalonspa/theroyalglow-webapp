/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/web)
 * Module Name  : web/middleware-session
 * Scope        : Customer site — session-cookie gate + onboarding prompt cookie
 *
 * Description  : Regression tests for two middleware behaviours.
 *
 *                1. The session-cookie gate must accept BOTH Better Auth cookie
 *                   names. Production issues `__Secure-better-auth.session_token`
 *                   because BETTER_AUTH_URL is https; local dev issues the bare
 *                   name. The gate used to read only the bare name, so every
 *                   signed-in production customer was bounced from /onboarding,
 *                   /profile, /bookings, /membership and /gems to the homepage.
 *                   Localhost worked, which is how it went unnoticed.
 *
 *                2. Serving /onboarding sets the prompted cookie that keeps the
 *                   homepage re-prompt quiet for 24h. A prefetch must not.
 *
 * Tech Stack   : Vitest, next/server
 * Layer        : Test
 ************************************************************/

import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import {
  ONBOARDING_PROMPTED_COOKIE,
  ONBOARDING_PROMPTED_MAX_AGE_SECONDS,
} from './lib/onboarding-prompt'
import { middleware } from './middleware'

const PRODUCTION_SESSION = '__Secure-better-auth.session_token=tok'
const LOCAL_SESSION = 'better-auth.session_token=tok'

const PROTECTED_PATHS = ['/onboarding', '/profile', '/bookings', '/membership', '/gems']

function request(
  path: string,
  headers: Record<string, string> = {},
  origin = 'https://theroyalglow.in',
): NextRequest {
  return new NextRequest(`${origin}${path}`, { headers })
}

/** True when the middleware let the request through to the page. */
function passedThrough(response: Response): boolean {
  return (
    response.headers.get('x-middleware-next') === '1' && response.headers.get('location') === null
  )
}

describe('session-cookie gate — accepts both Better Auth cookie names', () => {
  for (const path of PROTECTED_PATHS) {
    it(`lets a production (__Secure-) session reach ${path}`, async () => {
      const response = await middleware(request(path, { cookie: PRODUCTION_SESSION }))

      expect(passedThrough(response)).toBe(true)
    })
  }

  it('lets a local-dev (bare name) session reach a protected page', async () => {
    const response = await middleware(request('/profile', { cookie: LOCAL_SESSION }))

    expect(passedThrough(response)).toBe(true)
  })

  it('still sends a visitor with no session cookie to the homepage', async () => {
    const response = await middleware(request('/onboarding'))

    expect(response.status).toBe(307)
    expect(new URL(response.headers.get('location') ?? '').pathname).toBe('/')
  })

  it('does not mistake another Better Auth cookie for a session', async () => {
    const response = await middleware(
      request('/profile', { cookie: '__Secure-better-auth.state=abc' }),
    )

    expect(response.status).toBe(307)
  })
})

describe('onboarding prompted cookie', () => {
  it('is set when /onboarding is served: 24h, httpOnly, Secure over https, SameSite=Lax', async () => {
    const response = await middleware(request('/onboarding', { cookie: PRODUCTION_SESSION }))

    expect(response.cookies.get(ONBOARDING_PROMPTED_COOKIE)).toMatchObject({
      value: '1',
      maxAge: ONBOARDING_PROMPTED_MAX_AGE_SECONDS,
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
    })
    expect(ONBOARDING_PROMPTED_MAX_AGE_SECONDS).toBe(24 * 60 * 60)
  })

  it('is NOT set by a Next.js router prefetch of /onboarding', async () => {
    for (const header of ['next-router-prefetch', 'next-router-segment-prefetch']) {
      const response = await middleware(
        request('/onboarding', { cookie: PRODUCTION_SESSION, [header]: '1' }),
      )

      expect(response.cookies.get(ONBOARDING_PROMPTED_COOKIE), header).toBeUndefined()
    }
  })

  it('is NOT set by a browser speculative prefetch', async () => {
    const response = await middleware(
      request('/onboarding', { cookie: PRODUCTION_SESSION, 'sec-purpose': 'prefetch' }),
    )

    expect(response.cookies.get(ONBOARDING_PROMPTED_COOKIE)).toBeUndefined()
  })

  it('is NOT set on any other page', async () => {
    for (const path of ['/', '/services', '/profile']) {
      const response = await middleware(request(path, { cookie: PRODUCTION_SESSION }))

      expect(response.cookies.get(ONBOARDING_PROMPTED_COOKIE), path).toBeUndefined()
    }
  })

  it('is not marked Secure over plain http (local dev), so the browser keeps it', async () => {
    const response = await middleware(
      request('/onboarding', { cookie: LOCAL_SESSION }, 'http://localhost:3000'),
    )

    expect(response.cookies.get(ONBOARDING_PROMPTED_COOKIE)?.secure).toBe(false)
  })
})
