/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 15-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : tests/support/create-test-admin
 * Scope        : CMS E2E Support — Throwaway Admin Provisioning
 *
 * Description  : Creates a single throwaway Payload admin user for the
 *                service-sync E2E suite, using the Payload LOCAL API so the
 *                password is hashed exactly the way Payload's own login expects.
 *
 * Responsibilities :
 * - Create one `cms.users` row from E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD
 * - Refuse to run unless the email carries the E2E prefix (cleanup contract)
 *
 * Features / Functionality :
 * - Invoked as a BUN SUBPROCESS from the Playwright spec (see e2e-admin.ts),
 *   because loading `payload.config.ts` needs the CMS module graph + its
 *   `@payload-config` alias, not Playwright's test runtime
 *
 * Usage :
 *   cd apps/cms
 *   E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=... \
 *     bun run --env-file=.env.local tests/support/create-test-admin.ts
 *
 * Tech Stack   : Payload CMS v3, Bun
 * Layer        : CMS (Test Support)
 *
 * Dependencies : payload, @payload-config
 *
 * Notes        :
 * - The 2 real `cms.users` rows are NEVER touched and their passwords are never
 *   needed. This user is created at run time, used for one suite, then deleted
 *   by `cleanupE2eRows()`.
 * - The password is generated per run by the caller and passed through the
 *   environment. Nothing is hard-coded and nothing is committed.
 ************************************************************/
import config from '@payload-config'
import { getPayload } from 'payload'

const email = process.env.E2E_ADMIN_EMAIL ?? ''
const password = process.env.E2E_ADMIN_PASSWORD ?? ''

if (email === '' || password === '') {
  throw new Error('E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD must both be set.')
}

// Cleanup is prefix-keyed. An unprefixed email would be invisible to teardown
// and would leave a real-looking admin account behind, so it is refused here.
if (!email.startsWith('zz-e2e-')) {
  throw new Error(`Refusing to create an E2E admin without the zz-e2e- prefix: ${email}`)
}

const payload = await getPayload({ config })

await payload.create({
  collection: 'users',
  data: { email, password, name: 'E2E Service Sync (throwaway)' },
})

console.log(`created ${email}`)
process.exit(0)
