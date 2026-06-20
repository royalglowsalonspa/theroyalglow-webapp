import { expect, request, test } from '@playwright/test'
import { ADMIN_ORIGIN, WEB_BASE_URL } from './fixtures/auth'

/************************************************************
 * Legacy /admin/* → admin subdomain 301 redirect E2E (Req 15.5, 9.4)
 *
 * The redirect lives in the WEB app's middleware (apps/web), so these specs
 * target the web base URL via absolute requests with redirects disabled
 * (`maxRedirects: 0`) and assert the 301 STATUS + `Location` header. No browser
 * session is required — this is a pure request-level contract check.
 *
 *   theroyalglow.in/admin           → 301 → admin.theroyalglow.in        (root)
 *   theroyalglow.in/admin/bookings  → 301 → admin.theroyalglow.in/bookings
 ************************************************************/

test.describe('web → admin 301 redirects', () => {
  let api: import('@playwright/test').APIRequestContext

  test.beforeAll(async () => {
    // Dedicated request context rooted at the WEB origin (not the admin baseURL).
    api = await request.newContext({ baseURL: WEB_BASE_URL })
  })

  test.afterAll(async () => {
    await api.dispose()
  })

  test('GET /admin → 301 to the admin origin root', async () => {
    const res = await api.get('/admin', { maxRedirects: 0 })

    expect(res.status(), '/admin must 301 (permanent)').toBe(301)

    const location = res.headers().location ?? ''
    // Drops the /admin prefix → bare admin origin root.
    expect(location.replace(/\/$/, '')).toBe(ADMIN_ORIGIN.replace(/\/$/, ''))
  })

  test('GET /admin/bookings → 301 to admin /bookings (sub-path preserved)', async () => {
    const res = await api.get('/admin/bookings', { maxRedirects: 0 })

    expect(res.status(), '/admin/bookings must 301 (permanent)').toBe(301)

    const location = res.headers().location ?? ''
    expect(location).toBe(`${ADMIN_ORIGIN.replace(/\/$/, '')}/bookings`)
  })
})
