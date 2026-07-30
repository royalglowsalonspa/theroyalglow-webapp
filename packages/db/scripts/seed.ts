/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : seed
 * Scope        : Database Seeding
 *
 * Description  : Master seed orchestrator that reads APP_ENV and runs the
 *                appropriate seed modules with safety guards for production.
 *
 * Responsibilities :
 * - Orchestrate production essentials seeding (all environments)
 * - Gate demo data seeding to dev/test environments only
 * - Prevent --reset on production environments
 * - Block seeding on pprd (syncs from prod via Neon branch reset)
 *
 * Features / Functionality :
 * - Environment-aware seeding (dev/test/prod)
 * - Safety guard: --reset NEVER allowed on prod
 * - Phase 1: Production essentials (branch, settings, categories, services)
 * - Phase 2: Demo data (dev/test only — staff, customers, bookings)
 * - Performance timing for seed execution
 *
 * Tech Stack   : TypeScript, Drizzle ORM
 * Layer        : Data Access
 *
 * Dependencies : util (parseArgs), ./seed-prod
 *
 * Notes        : Usage: APP_ENV=dev bun run scripts/seed.ts [--reset]
 ************************************************************/

/**
 * Master seed orchestrator.
 *
 * Reads APP_ENV from environment and runs the appropriate seed modules:
 * - All environments: production essentials (branch, settings, categories, services, tiers, tags)
 * - dev/test only: demo data (staff, customers, bookings, etc.)
 *
 * Safety guard: --reset is NEVER allowed on prod.
 *
 * Usage:
 *   APP_ENV=dev bun run scripts/seed.ts
 *   APP_ENV=prod bun run scripts/seed.ts
 *   APP_ENV=dev bun run scripts/seed.ts --reset
 */

import { parseArgs } from 'node:util'

const env = (process.env.APP_ENV || 'dev') as 'dev' | 'test' | 'prod' | 'pprd'

const { values: flags } = parseArgs({
  options: {
    reset: { type: 'boolean', default: false },
  },
  strict: false,
})

// ─── Safety Guards ───────────────────────────────────────────────────────────

if (flags.reset && env === 'prod') {
  console.error('❌ Cannot --reset on prod. Aborting.')
  process.exit(1)
}

if (env === 'pprd') {
  console.error('❌ pprd is NOT seeded — it syncs from prod via Neon branch reset.')
  process.exit(1)
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🌱 Seed orchestrator — environment: ${env}\n`)
  const start = performance.now()

  // Phase 1: Production essentials (all environments)
  console.log('── Phase 1: Production essentials ──')
  await import('./seed-prod')
  console.log('')

  // Phase 2: Demo data (dev/test only)
  if (env === 'dev' || env === 'test') {
    console.log('── Phase 2: Demo data ──')
    console.log('  ⏭️  Demo data seeding not yet implemented')
    console.log('')
  }

  const elapsed = ((performance.now() - start) / 1000).toFixed(2)
  console.log(`🎉 All seeding complete in ${elapsed}s\n`)
}

main().catch((e) => {
  console.error('❌ Seed orchestrator failed:', e)
  process.exit(1)
})
