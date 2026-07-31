/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : seed-prod
 * Scope        : Database Seeding — Production
 *
 * Description  : Production seed script that inserts essential operational data
 *                needed for the app to function. Idempotent via onConflictDoNothing.
 *
 * Responsibilities :
 * - Seed branch records (Rayasandra, Marathahalli)
 * - Seed system settings (GST, gems rules, cancellation policies)
 * - Seed service categories (salon + spa)
 * - Seed all services (salon 34 + spa 23 = 57)
 * - Seed SPA membership tiers (Silver, Gold, Platinum)
 * - Seed customer tags (VIP, Frequent, No-Show Risk, etc.)
 *
 * Features / Functionality :
 * - Fully idempotent (safe to run multiple times)
 * - Respects FK constraints via ordered execution
 * - Direct Neon connection (independent of app db instance)
 * - Performance timing for seed execution
 *
 * Tech Stack   : TypeScript, Drizzle ORM
 * Layer        : Data Access
 *
 * Dependencies : @neondatabase/serverless, drizzle-orm/neon-http,
 *                ../src/schema/*, ./data/*
 *
 * Notes        : Execution order: branch → settings → categories → services
 *                → tiers → tags (FK dependency chain).
 ************************************************************/

/**
 * Production seed script — seeds essential data that the app needs to function.
 * Safe to run multiple times (idempotent — uses onConflictDoNothing).
 *
 * Seeded tables: branch, system_setting, service_category, service,
 *                spa_membership_tier, customer_tag
 *
 * Execution order respects FK constraints:
 *   branch → settings → categories → services → tiers → tags
 */

import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { branch } from '../src/schema/branch'
import { customerTag } from '../src/schema/crm'
import { spaMembershipTier } from '../src/schema/membership'
import { service, serviceCategory } from '../src/schema/service'
import { systemSetting } from '../src/schema/system'

import { branches } from './data/branches'
import { categories } from './data/categories'
import { customerTags } from './data/customer-tags'
import { membershipTiers } from './data/membership-tiers'
import { salonServices } from './data/services-salon'
import { spaServices } from './data/services-spa'
import { systemSettings } from './data/settings'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required.')
  process.exit(1)
}

const sql = neon(DATABASE_URL)
const db = drizzle(sql)

async function seedBranches() {
  console.log('  → Seeding branches...')
  await db.insert(branch).values(branches).onConflictDoNothing()
  console.log(`    ✓ ${branches.length} branches`)
}

async function seedSettings() {
  console.log('  → Seeding system settings...')
  const rows = systemSettings.map((s) => ({
    id: `setting_${s.key}`,
    key: s.key,
    value: s.value,
  }))
  await db.insert(systemSetting).values(rows).onConflictDoNothing()
  console.log(`    ✓ ${rows.length} settings`)
}

async function seedCategories() {
  console.log('  → Seeding service categories...')
  await db.insert(serviceCategory).values(categories).onConflictDoNothing()
  console.log(`    ✓ ${categories.length} categories`)
}

async function seedServices() {
  console.log('  → Seeding services...')
  const allServices = [...salonServices, ...spaServices]
  await db.insert(service).values(allServices).onConflictDoNothing()
  console.log(
    `    ✓ ${allServices.length} services (${salonServices.length} salon + ${spaServices.length} spa)`,
  )
}

async function seedMembershipTiers() {
  console.log('  → Seeding membership tiers...')
  await db.insert(spaMembershipTier).values(membershipTiers).onConflictDoNothing()
  console.log(`    ✓ ${membershipTiers.length} tiers`)
}

async function seedCustomerTags() {
  console.log('  → Seeding customer tags...')
  await db.insert(customerTag).values(customerTags).onConflictDoNothing()
  console.log(`    ✓ ${customerTags.length} tags`)
}

async function main() {
  console.log('\n🌱 Seeding production essentials...\n')
  const start = performance.now()

  // Execution order respects FK constraints
  await seedBranches()
  await seedSettings()
  await seedCategories()
  await seedServices()
  await seedMembershipTiers()
  await seedCustomerTags()

  const elapsed = ((performance.now() - start) / 1000).toFixed(2)
  console.log(`\n✅ Production essentials seeded in ${elapsed}s\n`)
}

main().catch((e) => {
  console.error('❌ Seed failed:', e)
  process.exit(1)
})
