import type { Schedule } from '@upstash/qstash'
import { afterEach, expect, it, vi } from 'vitest'
import { JOB_SCHEDULES } from '../src/lib/jobs/schedules'
import { registerSchedules } from './register-schedules'

const appUrl = 'https://admin.theroyalglow.in'
const provider = 'https://qstash-us-east-1.upstash.io'
const env = { token: 'test-schedule-token', appUrl, provider }
const reminder = 'appointment-reminders'
const settlement = 'settlement-close'
const roster = 'invoice-staff-roster'

function schedule(key: string, patch: Partial<Schedule> = {}): Schedule {
  const job = JOB_SCHEDULES.find((candidate) => candidate.key === key)
  if (!job) throw new Error('Unknown fixture job')
  return {
    scheduleId: `existing-${key}`,
    cron: job.cron,
    createdAt: 0,
    destination: `${appUrl}${job.path}`,
    method: 'POST',
    retries: 3,
    isPaused: false,
    ...patch,
  }
}

function stubProvider(schedules: Schedule[]) {
  const transport = vi.fn<typeof fetch>(async (_, options) => {
    if (options?.method === 'GET') return Response.json(schedules)
    if (options?.method === 'POST') {
      const headers = new Headers(options.headers)
      return Response.json({ scheduleId: headers.get('Upstash-Schedule-Id') })
    }
    throw new Error('Unexpected provider operation')
  })
  vi.stubGlobal('fetch', transport)
  return transport
}

afterEach(() => vi.unstubAllGlobals())

it('lists a scoped dry run without schedule changes', async () => {
  const transport = stubProvider([schedule(reminder, { isPaused: true })])
  const report = vi.fn()
  await registerSchedules(['--dry', '--jobs', settlement], env, report)
  expect(transport).toHaveBeenCalledExactlyOnceWith(
    `${provider}/v2/schedules`,
    expect.objectContaining({ method: 'GET' }),
  )
  expect(report.mock.calls.flat()).toEqual([
    `Dry run for ${appUrl}`,
    `${settlement} 0 19 * * * ${appUrl}/api/jobs/${settlement} create`,
  ])
})

it.each([roster, 'invoice-outbox'])('requires explicit scope to register %s', async (jobKey) => {
  stubProvider(JOB_SCHEDULES.filter(({ key }) => key !== jobKey).map(({ key }) => schedule(key)))

  const full = vi.fn()
  await registerSchedules(['--dry'], env, full)
  expect(full.mock.calls.flat().join('\n')).not.toContain(jobKey)

  const scoped = vi.fn()
  await registerSchedules(['--dry', '--jobs', jobKey], env, scoped)
  expect(scoped).toHaveBeenCalledWith(`${jobKey} */15 * * * * ${appUrl}/api/jobs/${jobKey} create`)
})

it('creates only missing selected schedules and leaves matching or unrelated schedules alone', async () => {
  const recheck = 'realtime-revocations'
  const transport = stubProvider([
    schedule(reminder, { isPaused: true }),
    schedule(recheck),
    schedule(settlement, { destination: `https://other.example/api/jobs/${settlement}` }),
  ])
  await registerSchedules(['--jobs', `${settlement},${recheck}`], env, vi.fn())
  expect(transport).toHaveBeenCalledTimes(2)
  const [url, options] = transport.mock.calls[1] ?? []
  expect(String(url)).toBe(`${provider}/v2/schedules/${appUrl}/api/jobs/${settlement}`)
  expect(options?.method).toBe('POST')
  const headers = new Headers(options?.headers)
  expect(headers.get('Upstash-Schedule-Id')).toMatch(/^rgss-[a-f0-9]{32}$/)
  expect(headers.get('Upstash-Method')).toBe('POST')
  expect(headers.get('Upstash-Cron')).toBe('0 19 * * *')
})

it.each([
  { conflict: [schedule(settlement, { isPaused: true })], reason: 'paused schedule' },
  {
    conflict: [
      schedule(settlement),
      schedule(settlement, {
        scheduleId: 'other-id',
        destination: `${appUrl}/api/jobs/${settlement}/?extra=1`,
      }),
    ],
    reason: 'duplicate schedules',
  },
  { conflict: [schedule(settlement, { cron: '* * * * *' })], reason: 'existing schedule differs' },
])(
  'rejects a scoped $reason before creating any of the selected jobs',
  async ({ conflict, reason }) => {
    const transport = stubProvider(conflict)
    const report = vi.fn()
    await expect(
      registerSchedules(['--jobs', `${reminder},${settlement}`], env, report),
    ).rejects.toThrow('Resolve the blocked schedules')
    expect(transport).toHaveBeenCalledTimes(1)
    expect(report).toHaveBeenCalledWith(expect.stringContaining(reason))
  },
)

it.each([
  { args: ['--jobs', 'unknown-job'] },
  { args: ['--jobs', `${settlement},${settlement}`] },
  { args: ['--jobs', `${settlement},`] },
  { args: ['--jobs', settlement, '--jobs', reminder] },
])('rejects invalid job scopes before contacting QStash ($args)', async ({ args }) => {
  const transport = stubProvider([])
  await expect(registerSchedules(args, env, vi.fn())).rejects.toThrow('unique canonical job keys')
  expect(transport).not.toHaveBeenCalled()
})

it('updates only the active mismatch by ID for a full apply and uses the default provider', async () => {
  const existing = JOB_SCHEDULES.map(({ key }) => schedule(key))
  const stale = existing.find((entry) => entry.scheduleId === `existing-${settlement}`)
  if (!stale) throw new Error('Expected a settlement schedule')
  stale.cron = '* * * * *'
  const transport = stubProvider(existing)
  await registerSchedules([], { ...env, provider: '' }, vi.fn())
  expect(transport).toHaveBeenCalledTimes(2)
  const [url, options] = transport.mock.calls[1] ?? []
  expect(String(url)).toBe(
    `https://qstash.upstash.io/v2/schedules/${appUrl}/api/jobs/${settlement}`,
  )
  expect(new Headers(options?.headers).get('Upstash-Schedule-Id')).toBe(`existing-${settlement}`)
})
