import path from 'node:path'
import { defineConfig, devices } from '@playwright/test'
import { loadEnvFile } from './tests/support/env'

/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/cms)
 * Module Name  : playwright.config
 * Scope        : CMS E2E test configuration (Payload → Drizzle sync)
 *
 * Description  : Playwright config for the Payload CMS suite. The suite drives
 *                the real admin panel and then asserts against the live Neon
 *                branch, so it needs BOTH a running CMS and `DATABASE_URL`.
 *
 *                It is DELIBERATELY separate from the root config
 *                (`playwright.config.ts`, testDir `apps/web/e2e`) and from
 *                `apps/admin/playwright.config.ts`. The root `test:e2e` script
 *                — the one CI runs — therefore does NOT pick these specs up.
 *                Run them explicitly:
 *
 *                  cd apps/cms && bunx playwright test
 *
 * Env vars     :
 * - DATABASE_URL              : loaded from `.env.local` (apps/cms has no `.env`).
 * - PLAYWRIGHT_CMS_BASE_URL   : CMS origin (default http://localhost:3002).
 *     When set, NO local webServer is started.
 *
 * Notes        :
 * - webServer runs `bunx next dev --webpack -p 3002`, NOT the default (Turbopack)
 *   dev server and NOT `next build && next start`. Two reasons:
 *     1. Turbopack cannot start on the maintainer's Windows machine — an
 *        Application Control policy blocks the native SWC binary and Turbopack
 *        refuses WASM-only bindings. `--webpack` is the working path.
 *     2. `next build` for this app is slow enough to blow a sensible E2E
 *        timeout, and the suite tests server-side hook behaviour, not the
 *        production bundle.
 * - NOT wired into CI: there is no Neon branch and no CMS server there, and the
 *   suite writes to a live catalogue. It is a local/manual verification gate.
 ************************************************************/

// apps/cms has NO `.env` file — only `.env.local`. Next loads it for the dev
// server automatically; this process needs it loaded explicitly for DATABASE_URL.
loadEnvFile(path.resolve(import.meta.dirname, '.env.local'))

const CMS_BASE_URL = process.env.PLAYWRIGHT_CMS_BASE_URL ?? 'http://localhost:3002'
const useLocalServer = !process.env.PLAYWRIGHT_CMS_BASE_URL

const localWebServer = {
  // --webpack is REQUIRED here; see the header note on Turbopack.
  command: 'bunx next dev --webpack -p 3002',
  url: `${CMS_BASE_URL}/admin/login`,
  timeout: 240_000,
  reuseExistingServer: !process.env.CI,
  stdout: 'pipe' as const,
  stderr: 'pipe' as const,
}

export default defineConfig({
  testDir: './tests',
  // The suite writes to a shared live catalogue and cleans up after itself, so
  // it MUST NOT run files in parallel.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  timeout: 90_000,
  use: {
    baseURL: CMS_BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  ...(useLocalServer ? { webServer: localWebServer } : {}),
})
