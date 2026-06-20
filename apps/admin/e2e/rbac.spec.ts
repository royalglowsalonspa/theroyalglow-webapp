import { expect, test } from '@playwright/test'
import { type AdminRole, hasRoleState, roleStatePath } from './fixtures/auth'

/************************************************************
 * Admin RBAC matrix E2E (Req 15.2, 5.2)
 *
 * Drives each seeded role account against representative routes and asserts the
 * admin middleware's access decision:
 *   - Receptionist (level 2): reaches /bookings (200), 403 on /users
 *   - Owner       (level 4): reaches /users (200)
 *   - Developer   (level 5): reaches /logs (200)
 *
 * Each role block self-skips when its storageState file is absent (see
 * e2e/fixtures/auth.ts), so the suite enumerates without seeded accounts but
 * runs fully against a deployed/seeded environment.
 *
 * Access is asserted at the response level: an allowed route returns 200 and a
 * forbidden route returns 403 (the middleware emits a bare 403, no redirect).
 ************************************************************/

/** Assert a route is reachable (renders) for the current authenticated role. */
async function expectAllowed(page: import('@playwright/test').Page, route: string): Promise<void> {
  const res = await page.goto(route, { waitUntil: 'domcontentloaded' })
  expect(res, `expected a response for ${route}`).not.toBeNull()
  expect(res?.status(), `${route} should render (200)`).toBe(200)
  // Not bounced off the admin origin (still on the requested path).
  expect(new URL(page.url()).pathname).toContain(route)
}

/** Assert a route is forbidden (403) for the current authenticated role. */
async function expectForbidden(
  page: import('@playwright/test').Page,
  route: string,
): Promise<void> {
  const res = await page.goto(route, { waitUntil: 'domcontentloaded' })
  expect(res, `expected a response for ${route}`).not.toBeNull()
  expect(res?.status(), `${route} should be forbidden (403)`).toBe(403)
}

/** Register an RBAC block for a role, skipping when no seeded state exists. */
function rbacForRole(role: AdminRole, body: () => void): void {
  test.describe(`RBAC — ${role}`, () => {
    test.skip(
      !hasRoleState(role),
      `no seeded storageState for "${role}" (set ADMIN_E2E_${role.toUpperCase()}_STATE)`,
    )
    test.use({ storageState: roleStatePath(role) })
    body()
  })
}

rbacForRole('receptionist', () => {
  test('reaches /bookings', async ({ page }) => {
    await expectAllowed(page, '/bookings')
  })

  test('is forbidden on /users', async ({ page }) => {
    await expectForbidden(page, '/users')
  })
})

rbacForRole('owner', () => {
  test('reaches /users', async ({ page }) => {
    await expectAllowed(page, '/users')
  })
})

rbacForRole('developer', () => {
  test('reaches /logs', async ({ page }) => {
    await expectAllowed(page, '/logs')
  })
})
