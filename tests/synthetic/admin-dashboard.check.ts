import { BrowserCheck, Frequency } from 'checkly/constructs'

// Check 4 (observability.md Layer 5): Admin dashboard loads (protected route).
// Validates RBAC-gated routing every 30 minutes.
//
// OPS NOTE: a fully authenticated run requires a dedicated low-privilege
// Checkly test account. Provide its credentials via Checkly environment
// variables (e.g. CHECKLY_ADMIN_EMAIL / CHECKLY_ADMIN_SESSION) and add a
// sign-in step here once the account exists — that is an ops step, not part of
// this code deliverable. Unauthenticated, /admin must redirect to /sign-in,
// which itself proves the protected-route guard is working; this check asserts
// the guard either lands on the dashboard (when authed) or on sign-in.
new BrowserCheck('rgss-admin-dashboard', {
  name: 'Admin dashboard loads or redirects to sign-in',
  frequency: Frequency.EVERY_30M,
  code: {
    content: `
const { test, expect } = require('@playwright/test')

test('admin route loads the dashboard or redirects to sign-in', async ({ page }) => {
  const baseURL = process.env.CHECKLY_TARGET_URL || 'https://theroyalglow.in'

  await page.goto(baseURL + '/admin', { waitUntil: 'domcontentloaded' })

  // Without an authenticated session the RBAC guard sends the user to
  // /sign-in; with a Checkly test account the dashboard "Quick Actions"
  // section renders. Accept either as a healthy protected-route response.
  const signInHeading = page.getByRole('heading', { name: 'Sign in to Royal Glow' })
  const dashboardHeading = page.getByRole('heading', { name: /quick actions/i })

  await expect(signInHeading.or(dashboardHeading)).toBeVisible()
})
`,
  },
})
