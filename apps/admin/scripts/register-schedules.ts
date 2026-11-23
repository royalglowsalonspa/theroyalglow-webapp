/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 23-11-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : scripts/register-schedules
 * Scope        : Background Jobs — QStash schedule registration
 ************************************************************/

import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { Client, type Schedule } from '@upstash/qstash'
import { rehearsalQStashOrigin } from '../../../scripts/release/rehearsal-config'
import { JOB_SCHEDULES } from '../src/lib/jobs/schedules'

type Job = (typeof JOB_SCHEDULES)[number]
type SchedulePlan = {
  job: Job
  destination: string
} & (
  | { action: 'keep' }
  | { action: 'create' | 'update'; scheduleId: string }
  | { action: 'blocked'; reason: string }
)

class ScheduleRegistrationError extends Error {}

function selectJobs(args: string[]) {
  let parsed: { dry?: boolean; jobs?: string[] }
  try {
    parsed = parseArgs({
      args,
      options: { dry: { type: 'boolean' }, jobs: { type: 'string', multiple: true } },
    }).values
  } catch {
    throw new ScheduleRegistrationError('Use register-schedules [--dry] [--jobs key1,key2]')
  }
  const dry = parsed.dry ?? false
  if (!parsed.jobs) return { jobs: JOB_SCHEDULES, dry, scoped: false }

  const keys = parsed.jobs[0]?.split(',').map((key) => key.trim()) ?? []
  const jobs = JOB_SCHEDULES.filter(({ key }) => keys.includes(key))
  if (parsed.jobs.length !== 1 || jobs.length !== keys.length || keys.length === 0) {
    throw new ScheduleRegistrationError(
      'Select unique canonical job keys as one comma-separated list',
    )
  }
  return { jobs, dry, scoped: true }
}

function planSchedule(base: string, job: Job, current: Schedule[], scoped: boolean): SchedulePlan {
  const destination = `${base}${job.path}`
  const target = { job, destination }
  const matches = current.filter((schedule) => {
    const url = URL.parse(schedule.destination)
    return url?.origin === base && url.pathname.replace(/\/+$/, '') === job.path
  })
  const [match] = matches
  if (!match) {
    // A rerun after a lost response uses the same ID for this exact destination.
    const scheduleId = `rgss-${createHash('sha256').update(destination).digest('hex').slice(0, 32)}`
    if (current.some((existing) => existing.scheduleId === scheduleId)) {
      return { ...target, action: 'blocked', reason: 'schedule ID already points elsewhere' }
    }
    return { ...target, action: 'create', scheduleId }
  }
  if (matches.length > 1) return { ...target, action: 'blocked', reason: 'duplicate schedules' }
  if (match.isPaused !== false) {
    return { ...target, action: 'blocked', reason: 'paused schedule requires explicit review' }
  }
  const cron = match.cron.trim().replace(/\s+/g, ' ')
  if (match.destination === destination && cron === job.cron && match.method === 'POST') {
    return { ...target, action: 'keep' }
  }
  if (scoped) return { ...target, action: 'blocked', reason: 'existing schedule differs' }
  return { ...target, action: 'update', scheduleId: match.scheduleId }
}

export async function registerSchedules(
  args: string[],
  env: { token?: string | undefined; appUrl?: string | undefined; provider?: string | undefined },
  report: (line: string) => void,
) {
  const { jobs, dry, scoped } = selectJobs(args)
  const token = env.token?.trim()
  if (!token) throw new ScheduleRegistrationError('QSTASH_TOKEN is required')
  const url = URL.parse(env.appUrl ?? '')
  if (!url || !['https:', 'http:'].includes(url.protocol) || url.href !== `${url.origin}/`) {
    throw new ScheduleRegistrationError(
      'NEXT_PUBLIC_APP_URL must be the public admin HTTP(S) origin',
    )
  }
  let baseUrl: string
  try {
    baseUrl = rehearsalQStashOrigin(env.provider?.trim() || undefined)
  } catch {
    throw new ScheduleRegistrationError('QSTASH_URL must be an Upstash QStash HTTPS origin')
  }

  const client = new Client({
    token,
    baseUrl,
    retry: false,
    devMode: false,
    enableTelemetry: false,
  })
  const current = await client.schedules.list()
  const plan = jobs.map((job) => planSchedule(url.origin, job, current, scoped))
  report(`${dry ? 'Dry run' : 'Registration plan'} for ${url.origin}`)
  for (const item of plan) {
    const action = item.action === 'blocked' ? item.reason : item.action
    report(`${item.job.key} ${item.job.cron} ${item.destination} ${action}`)
  }
  if (plan.some((item) => item.action === 'blocked')) {
    throw new ScheduleRegistrationError('Resolve the blocked schedules before applying the plan')
  }
  if (dry) return

  for (const item of plan) {
    if (item.action !== 'create' && item.action !== 'update') continue
    const { scheduleId } = await client.schedules.create({
      scheduleId: item.scheduleId,
      destination: item.destination,
      cron: item.job.cron,
      method: 'POST',
    })
    if (scheduleId !== item.scheduleId) {
      throw new ScheduleRegistrationError(`QStash returned an unexpected ID for ${item.job.key}`)
    }
    report(`${item.job.key} ${item.action === 'create' ? 'created' : 'updated'}`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await registerSchedules(
      process.argv.slice(2),
      {
        token: process.env.QSTASH_TOKEN,
        appUrl: process.env.NEXT_PUBLIC_APP_URL,
        provider: process.env.QSTASH_URL,
      },
      console.log,
    )
  } catch (error) {
    // Provider failures can include request details. Keep token and payloads out of terminal logs.
    console.error(
      error instanceof ScheduleRegistrationError ? error.message : 'Schedule registration failed',
    )
    process.exitCode = 1
  }
}
