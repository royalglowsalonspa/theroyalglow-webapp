/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : scripts/register-schedules
 * Scope        : Background Jobs — QStash schedule registration
 *
 * Description  : Idempotently registers the 15 QStash scheduled jobs (defined in
 *                src/lib/jobs/schedules.ts) against QStash. For each job it
 *                removes any existing schedule pointing at the same destination
 *                URL, then creates a fresh schedule with the configured cron —
 *                so re-running the script is always safe and converges to the
 *                JOB_SCHEDULES source of truth.
 *
 * Usage        : (run once per environment, with that env's values)
 *   QSTASH_TOKEN=... NEXT_PUBLIC_APP_URL=https://admin.theroyalglow.in \
 *     bun run scripts/register-schedules.ts
 *   Add --dry to preview without changing anything.
 *
 * Notes        : QStash cannot reach localhost, so this is a prod/pprd concern.
 *                NEXT_PUBLIC_APP_URL must be the PUBLIC origin QStash will POST to.
 *                Reads env directly (no @/env) so it runs as a standalone script.
 ************************************************************/

import { Client } from '@upstash/qstash'
import { JOB_SCHEDULES } from '../src/lib/jobs/schedules'

const token = process.env.QSTASH_TOKEN
const appUrl = process.env.NEXT_PUBLIC_APP_URL
const dryRun = process.argv.includes('--dry')

if (!token) {
  console.error('❌ QSTASH_TOKEN is required.')
  process.exit(1)
}
if (!appUrl || !/^https?:\/\//.test(appUrl)) {
  console.error('❌ NEXT_PUBLIC_APP_URL must be a public http(s) origin QStash can reach.')
  process.exit(1)
}

async function main(): Promise<void> {
  const client = new Client({ token: token as string })
  const base = (appUrl as string).replace(/\/$/, '')

  // Existing schedules — to remove stale ones for the same destinations first.
  const existing = await client.schedules.list()
  console.log(`\n🗓  Registering ${JOB_SCHEDULES.length} schedules against ${base}\n`)

  for (const job of JOB_SCHEDULES) {
    const destination = `${base}${job.path}`
    const stale = existing.filter((s) => s.destination === destination)

    if (dryRun) {
      const note = stale.length ? `  (would replace ${stale.length})` : ''
      console.log(`DRY  ${job.key.padEnd(26)} ${job.cron.padEnd(14)} → ${destination}${note}`)
      continue
    }

    // Remove any existing schedule(s) pointing at this destination (idempotent).
    for (const s of stale) {
      await client.schedules.delete(s.scheduleId)
    }

    const { scheduleId } = await client.schedules.create({
      destination,
      cron: job.cron,
    })

    console.log(`OK   ${job.key.padEnd(26)} ${job.cron.padEnd(14)} → ${scheduleId}`)
  }

  console.log('\n✅ Schedule registration complete.\n')
  process.exit(0)
}

main().catch((err) => {
  console.error('❌ Schedule registration failed:', err)
  process.exit(1)
})
