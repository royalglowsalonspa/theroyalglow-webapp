import { defineConfig, devices } from '@playwright/test'

/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : playwright.config
 * Scope        : Admin E2E test configuration
 *
 * Description  : Playwright config for the admin portal E2E suite. The base URL
 *                is environment-configurable so the same specs run against a
 *                local dev server, a `rgss-admin.pages.dev` preview, or the
 *                production `admin.theroyalglow.in` subdomain.
 *
 *                Two origins are involved in the suite:
 *                - the ADMIN origin (this config's baseURL) for RBAC + auth
 *                  redirect specs that exercise the admin middleware;
 *                - the WEB origin (theroyalglow.in) for the legacy `/admin/*`
 *                  301-redirect specs, which target the web app's middleware
 *                  via absolute URLs (see e2e/admin-redirect-301.spec.ts).
 *
 * Env vars     :
 * - PLAYWRIGHT_ADMIN_BASE_URL : admin origin (default http://localhost:3100).
 *     When set, NO local webServer is started (tests hit the deployed env).
 * - ADMIN_E2E_WEB_ORIGIN      : where unauthenticated visitors are bounced to
 *     (default https://theroyalglow.in); used by the auth-redirect spec.
 * - ADMIN_E2E_WEB_BASE_URL    : web app base URL for the 301 redirect specs
 *     (default https://theroyalglow.in).
 * - ADMIN_E2E_{ROLE}_STATE    : path to a Playwright storageState JSON for a
 *     seeded role account (receptionist/manager/owner/developer). See
 *     e2e/fixtures/auth.ts.
 * - ADMIN_E2E_IMPERSONATED_ROLE : the role of ADMIN_DEV_IMPERSONATE_EMAIL's
 *     account, for a local run without stored sessions. With no explicit base
 *     URL, the local server is then `next dev` (impersonation is ignored by
 *     production builds), started with that email.
 * - ADMIN_E2E_WRITE_PERSON_EMAIL / ADMIN_E2E_WRITE_BRANCH_ID : opt in to the
 *     people write journeys (e2e/people-writes.spec.ts).
 * - ADMIN_E2E_WRITE_MEMBERSHIP_SESSIONS=1 : opt in to the membership session
 *     journey (e2e/membership-sessions.spec.ts). It seeds a throwaway
 *     membership in the database packages/db/.env names, which must be the
 *     one the server reads, and deletes it afterwards.
 *
 * Notes        : RBAC specs require seeded role accounts. When a role's
 *                storageState is absent they self-skip (see fixtures/auth.ts),
 *                so the suite enumerates and typechecks cleanly without seeds.
 ************************************************************/

const ADMIN_BASE_URL = process.env.PLAYWRIGHT_ADMIN_BASE_URL ?? 'http://localhost:3001'

// Only spin up a local admin server when no explicit base URL is provided.
// Against a deployed/seeded environment we hit PLAYWRIGHT_ADMIN_BASE_URL directly.
const useLocalServer = !process.env.PLAYWRIGHT_ADMIN_BASE_URL

const impersonating = (process.env.ADMIN_E2E_IMPERSONATED_ROLE ?? '').trim() !== ''
if (
  impersonating &&
  useLocalServer &&
  (process.env.ADMIN_DEV_IMPERSONATE_EMAIL ?? '').trim() === ''
) {
  throw new Error(
    'ADMIN_E2E_IMPERSONATED_ROLE needs ADMIN_DEV_IMPERSONATE_EMAIL: the account the local dev server acts as.',
  )
}

const localWebServer = impersonating
  ? {
      // Impersonation only works outside production, so this is `next dev`.
      command: 'bun run --filter @rgss/admin dev',
      url: ADMIN_BASE_URL,
      timeout: 180_000,
      reuseExistingServer: !process.env.CI,
    }
  : {
      command: 'bun run --filter @rgss/admin build && bun run --filter @rgss/admin start',
      url: ADMIN_BASE_URL,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
    }

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: ADMIN_BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Only attach a local webServer when running against the default localhost
  // base URL; omit the key entirely (not `undefined`) for deployed-env runs.
  ...(useLocalServer ? { webServer: localWebServer } : {}),
})
