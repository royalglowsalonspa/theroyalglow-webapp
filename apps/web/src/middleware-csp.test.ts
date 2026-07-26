/************************************************************
 * Author       : KATABATHUNI BOSE
 *
 * Project      : theroyalglow-webapp
 * Module Name  : web/middleware-csp
 * Scope        : Customer site — CSP regression tests
 *
 * Description  : Guards the Content-Security-Policy stamped by the customer-site
 *                middleware. The brand fonts (Cabinet Grotesk + Clash Grotesk
 *                from Fontshare, Plus Jakarta Sans from Google Fonts) are loaded
 *                via `@import url(...)` in styles/globals.css. If the CSP does
 *                not permit those CDN origins, the browser BLOCKS the stylesheets
 *                and the site silently renders in a fallback system font — which
 *                is exactly what Lighthouse caught (an `errors-in-console`
 *                best-practices failure plus a render-delayed LCP).
 *
 *                apps/admin has the equivalent guard in middleware-csp.test.ts;
 *                the customer site had none, which is how this regressed
 *                unnoticed.
 ************************************************************/

import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import { middleware } from './middleware'

async function cspFor(path: string): Promise<string> {
  const request = new NextRequest(`https://theroyalglow.in${path}`)
  const response = await middleware(request)
  return response?.headers?.get('Content-Security-Policy') ?? ''
}

describe('customer-site CSP — brand font CDNs', () => {
  it('permits the font STYLESHEET hosts so the @import targets are not blocked', async () => {
    const csp = await cspFor('/')

    expect(csp).toBeTruthy()
    expect(csp).toContain('style-src')
    // Plus Jakarta Sans (Google Fonts) — the stylesheet that was being blocked.
    expect(csp).toContain('https://fonts.googleapis.com')
    // Cabinet Grotesk + Clash Grotesk (Fontshare).
    expect(csp).toContain('https://api.fontshare.com')
  })

  it('permits the font FILE hosts so the woff2 payloads are not blocked', async () => {
    const csp = await cspFor('/')

    expect(csp).toContain('font-src')
    expect(csp).toContain('https://fonts.gstatic.com')
    expect(csp).toContain('https://cdn.fontshare.com')
  })

  it('keeps the policy locked down: no wildcard host in style-src or font-src', async () => {
    const csp = await cspFor('/')

    const styleSrc = csp.split(';').find((d) => d.trim().startsWith('style-src')) ?? ''
    const fontSrc = csp.split(';').find((d) => d.trim().startsWith('font-src')) ?? ''

    // Widening these to a bare `https:` or `*` would defeat the point of the
    // strict policy — only the specific font CDNs are allowed.
    expect(styleSrc).not.toMatch(/\*/)
    expect(styleSrc).not.toMatch(/\shttps:(\s|$)/)
    expect(fontSrc).not.toMatch(/\*/)
    expect(fontSrc).not.toMatch(/\shttps:(\s|$)/)
  })
})
