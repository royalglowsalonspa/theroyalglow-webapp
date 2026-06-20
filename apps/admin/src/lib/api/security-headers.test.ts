// @vitest-environment node
/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : security-headers.test
 * Scope        : Unit tests for the static admin security headers
 *
 * Description  : Vitest unit tests asserting the static security headers
 *                declared in `apps/admin/next.config.ts` headers() — applied to
 *                every route. Verifies clickjacking protection
 *                (X-Frame-Options: DENY), MIME-sniff protection, referrer
 *                policy, and the noindex robots directive for the private
 *                admin portal.
 *
 * Notes        : Runs in the `node` environment. The Next config default export
 *                is wrapped by withSentryConfig; its `headers()` function is
 *                preserved and invoked directly here.
 *                _Requirements: 7.3, 7.7_
 ************************************************************/

import { describe, expect, it } from 'vitest'
// Import the (Sentry-wrapped) Next config default export.
import nextConfig from '../../../next.config'

type HeaderEntry = { key: string; value: string }
type HeaderRule = { source: string; headers: HeaderEntry[] }

async function getCatchAllHeaders(): Promise<Map<string, string>> {
  expect(typeof nextConfig.headers).toBe('function')
  // biome-ignore lint/style/noNonNullAssertion: guarded by the assertion above.
  const rules = (await nextConfig.headers!()) as HeaderRule[]

  const catchAll = rules.find((r) => r.source === '/:path*')
  if (!catchAll) {
    throw new Error('Expected a /:path* header rule in next.config headers()')
  }

  const map = new Map<string, string>()
  for (const { key, value } of catchAll.headers) {
    map.set(key, value)
  }
  return map
}

describe('admin next.config security headers (Req 7.7)', () => {
  it('applies the headers to every route via the /:path* source', async () => {
    const map = await getCatchAllHeaders()
    expect(map.size).toBeGreaterThan(0)
  })

  it('sets X-Frame-Options: DENY for clickjacking protection (Req 7.7)', async () => {
    const map = await getCatchAllHeaders()
    expect(map.get('X-Frame-Options')).toBe('DENY')
  })

  it('disables MIME-type sniffing with X-Content-Type-Options: nosniff', async () => {
    const map = await getCatchAllHeaders()
    expect(map.get('X-Content-Type-Options')).toBe('nosniff')
  })

  it('sets a Referrer-Policy to minimise referrer leakage', async () => {
    const map = await getCatchAllHeaders()
    expect(map.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
  })

  it('marks the private admin portal as noindex via X-Robots-Tag', async () => {
    const map = await getCatchAllHeaders()
    const robots = map.get('X-Robots-Tag')
    expect(robots).toBeDefined()
    expect(robots).toContain('noindex')
  })
})
