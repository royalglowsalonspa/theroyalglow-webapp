import { expect, test } from '@playwright/test'
import { WEB_ORIGIN } from './fixtures/auth'

/************************************************************
 * Admin auth-redirect E2E (Req 15.2, 4.4/4.7)
 *
 * An unauthenticated visitor hitting any admin route must be bounced to the
 * customer site (`https://theroyalglow.in`) — the admin app renders no sign-in.
 *
 * Two complementary checks:
 *  1. Request-level (no browser session): assert the redirect STATUS + the
 *     `Location` header points at the web origin. This needs no rendering and
 *     is robust against the external origin being unreachable in CI.
 *  2. Navigation-level: a real browser follows the bounce and lands on the web
 *     origin host. Skipped automatically if the web origin can't be reached.
 ************************************************************/

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

test.describe('unauthenticated admin access', () => {
  test('GET /bookings redirects (Location → web origin) without a session', async ({ request }) => {
    // No storageState on this context → no session cookie is sent.
    const res = await request.get('/bookings', { maxRedirects: 0 })

    expect(REDIRECT_STATUSES.has(res.status())).toBe(true)

    const location = res.headers().location ?? ''
    expect(location).toContain(new URL(WEB_ORIGIN).host)
  })

  test('navigating to /bookings lands on the customer site', async ({ page }) => {
    try {
      // Follows the redirect; if the external web origin is unreachable in this
      // environment the navigation throws and the test self-skips.
      await page.goto('/bookings', { waitUntil: 'domcontentloaded' })
    } catch {
      test.skip(true, 'web origin unreachable from this environment')
      return
    }

    expect(new URL(page.url()).host).toBe(new URL(WEB_ORIGIN).host)
  })
})
