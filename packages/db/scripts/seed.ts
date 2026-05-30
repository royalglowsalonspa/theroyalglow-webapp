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

import { parseArgs } from 'util'

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
  console.error('❌ Preprod is NOT seeded — it syncs from prod via Neon branch reset.')
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
