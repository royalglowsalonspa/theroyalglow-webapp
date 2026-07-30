/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 15-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : tests/support/admin
 * Scope        : CMS E2E Support — Admin Credentials & Login
 *
 * Description  : Provisions a throwaway Payload admin for the service-sync E2E
 *                suite and logs it in through the real admin login form.
 *
 * Responsibilities :
 * - Generate a random, run-scoped email + password (never hard-coded, never
 *   committed, never read from a real account)
 * - Create the user by shelling out to the Payload Local API script
 * - Drive the `/admin/login` form and confirm the session
 *
 * Tech Stack   : Playwright, Bun, Payload CMS v3
 * Layer        : CMS (Test Support)
 *
 * Dependencies : @playwright/test, node:child_process, node:crypto
 *
 * Notes        :
 * - Payload uses its OWN `users` collection (auth: true), NOT Better Auth. The
 *   two real CMS accounts are left completely alone — their passwords are not
 *   needed and must not be guessed or committed.
 * - Creating the user needs the Local API (Payload hashes the password itself),
 *   which needs the CMS module graph + its `@payload-config` alias — hence the
 *   Bun subprocess rather than an in-process import.
 * - Credentials travel through the subprocess ENVIRONMENT, never argv, so the
 *   generated password never lands in a command line or a shell history.
 ************************************************************/
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { expect, type Page } from '@playwright/test'
import { E2E_PREFIX } from './db'

export type TestAdmin = {
  email: string
  password: string
}

const CMS_ROOT = path.resolve(import.meta.dirname, '../..')

/**
 * Run-scoped throwaway credentials.
 *
 * The email carries E2E_PREFIX because teardown (`cleanupE2eRows`) is
 * prefix-keyed. The password is 32 random bytes, base64url-encoded, generated
 * fresh on every run — there is no default and no fallback value.
 */
export function generateTestAdmin(): TestAdmin {
  const unique = randomBytes(6).toString('hex')
  return {
    email: `${E2E_PREFIX}admin-${unique}@example.invalid`,
    password: `Aa1!${randomBytes(24).toString('base64url')}`,
  }
}

/** Create the throwaway admin via the Payload Local API (Bun subprocess). */
export function createTestAdmin(admin: TestAdmin): void {
  const result = spawnSync(
    'bun',
    ['run', '--env-file=.env.local', 'tests/support/create-test-admin.ts'],
    {
      cwd: CMS_ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        E2E_ADMIN_EMAIL: admin.email,
        E2E_ADMIN_PASSWORD: admin.password,
        // The seed/rollback lever must NOT be off here: these tests exist to
        // prove the sync fires.
        SERVICE_SYNC_ENABLED: 'true',
      },
    },
  )

  if (result.status !== 0) {
    throw new Error(
      [
        'Failed to create the throwaway CMS admin user.',
        `exit code: ${result.status}`,
        result.stdout,
        result.stderr,
      ].join('\n'),
    )
  }
}

/** Log the throwaway admin in through the real Payload login form. */
export async function loginToPayload(page: Page, admin: TestAdmin): Promise<void> {
  await page.goto('/admin/login')
  await page.locator('#field-email').fill(admin.email)
  await page.locator('#field-password').fill(admin.password)
  await page.getByRole('button', { name: 'Login' }).click()

  // The dashboard renders the collection groups once the session cookie is set.
  await expect(page.locator('.dashboard')).toBeVisible({ timeout: 30_000 })
}
