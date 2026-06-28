/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 28-06-2026 & Updated - 28-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : scripts/anonymize-preprod
 * Scope        : Ops — pprd data anonymisation
 *
 * Description  : Strips customer PII from the `pprd` Neon branch after it has
 *                been reset (copy-on-write) from `prod`. Run by the
 *                "Replicate Prod to pprd" GitHub Actions workflow immediately
 *                after the branch restore, so UAT has realistic data WITHOUT
 *                real customer phone numbers, emails, names, or UTM attribution.
 *                Mirrors the anonymisation SQL documented in git-workflow.md and
 *                background-jobs.md (Job 5).
 *
 * Responsibilities :
 * - Mask customer_profile phone (keep last 5 digits) + null UTM attribution
 * - Replace user email + name with deterministic anonymised values
 *
 * Tech Stack   : TypeScript, @neondatabase/serverless
 * Layer        : Ops script (standalone — independent of the app db instance)
 *
 * Dependencies : @neondatabase/serverless
 *
 * Notes        :
 * - DESTRUCTIVE (overwrites PII). It MUST only ever target the pprd branch.
 *   Two guards enforce this: (1) DATABASE_URL must be set; (2) the explicit
 *   opt-in `PPRD_ANONYMIZE=1` must be present (the replication workflow sets
 *   it). Without the opt-in the script refuses to run, so it can never nuke
 *   prod/dev by accident from a stray local invocation.
 * - Idempotent: the masks are stable under re-application (the last 5 phone
 *   digits are preserved; email/name derive deterministically from the user id),
 *   so re-running over already-anonymised data is a no-op in effect.
 ************************************************************/

import { neon } from '@neondatabase/serverless'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required.')
  process.exit(1)
}

// Safety opt-in. The replication workflow sets PPRD_ANONYMIZE=1 for the pprd
// branch only. Without it, refuse — this guards against accidentally running
// the destructive PII overwrite against prod or dev.
if (process.env.PPRD_ANONYMIZE !== '1') {
  console.error(
    '❌ Refusing to run: set PPRD_ANONYMIZE=1 to confirm this targets the pprd branch. ' +
      'This script overwrites customer PII and must never run against prod/dev.',
  )
  process.exit(1)
}

const sql = neon(DATABASE_URL)

async function main(): Promise<void> {
  console.log('🔒 Anonymising pprd customer PII…')

  // Mask phone (keep last 5 digits for realistic-looking but non-identifying
  // values) and clear UTM attribution on customer_profile. RIGHT(phone, 5) is
  // stable under re-application, so this is idempotent.
  const profiles = await sql`
    UPDATE customer_profile
    SET phone        = 'XXXXX' || RIGHT(phone, 5),
        utm_campaign = NULL,
        utm_source   = NULL
    WHERE phone IS NOT NULL
  `

  // Replace email + name with deterministic anonymised values derived from the
  // user id (stable → idempotent). Quoted "user" because it is a reserved word.
  const users = await sql`
    UPDATE "user"
    SET email = 'anon_' || id || '@dev.theroyalglow.in',
        name  = 'Test User ' || SUBSTRING(id, 1, 6)
  `

  // neon() returns the affected-row arrays; length is the row count for UPDATEs
  // without RETURNING on the http driver, so log a generic completion instead.
  console.log('✅ pprd anonymisation complete.', {
    profilesTouched: Array.isArray(profiles) ? profiles.length : undefined,
    usersTouched: Array.isArray(users) ? users.length : undefined,
  })
  process.exit(0)
}

main().catch((err) => {
  console.error('❌ pprd anonymisation failed:', err)
  process.exit(1)
})
