import { afterEach, expect, it, vi } from 'vitest'
import { rehearsalQStashOrigin } from '../../../scripts/release/rehearsal-config'
import { JOB_SCHEDULES } from '../src/lib/jobs/schedules'
import { runQStashCheck } from './rehearse-qstash-delivery'

const domain = 'fixture.example.com'
const rehearsalOrigin = `https://admin.${domain}`
const productionOrigin = 'https://admin.theroyalglow.in'
const fixtureEnv = {
  REHEARSAL_DOMAIN: domain,
  REHEARSAL_QSTASH_TOKEN: 'rehearsal-test-token',
  REHEARSAL_QSTASH_URL: 'https://qstash-eu-central-1.upstash.io',
  QSTASH_TOKEN: 'production-test-token',
  QSTASH_URL: 'https://qstash-us-east-1.upstash.io',
  NEXT_PUBLIC_APP_URL: 'https://other.example.com',
}
const invoiceJob = '/api/jobs/invoice-pdf'
const destination = `${rehearsalOrigin}${invoiceJob}`
const messageId = 'msg_synthetic'
const deliveredAt = '2026-11-22T17:00:00.000Z'
const log = { state: 'DELIVERED', url: destination, messageId, time: Date.parse(deliveredAt) }
const fixtureSchedules = JOB_SCHEDULES.map((job) => ({
  scheduleId: `schedule-${job.key}`,
  destination: `https://admin.${domain}${job.path}`,
  cron: job.cron,
  method: 'POST',
  isPaused: false,
  createdAt: 0,
  retries: 3,
}))

function stubTransport(...responses: Response[]) {
  const transport = vi.fn<typeof fetch>()
  for (const response of responses) transport.mockResolvedValueOnce(response)
  vi.stubGlobal('fetch', transport)
  return transport
}

afterEach(() => vi.unstubAllGlobals())

it('does not contact the origin or QStash when given a production domain', async () => {
  const transport = stubTransport()
  await expect(
    runQStashCheck([], { ...fixtureEnv, REHEARSAL_DOMAIN: 'fixture.theroyalglow.in' }),
  ).rejects.toThrow('isolated SST rehearsal domain')
  expect(transport).not.toHaveBeenCalled()
})

it.each([
  { args: ['--production'] },
  { args: ['--confirm-no-invoice-delivery'] },
  { args: ['--production', '--verify-schedules', '--confirm-no-invoice-delivery'] },
  { args: ['--production', '--confirm-no-invoice-delivery', 'https://other.example.com'] },
])('requires one exact production action before network I/O ($args)', async ({ args }) => {
  const transport = stubTransport()
  await expect(runQStashCheck(args, fixtureEnv)).rejects.toThrow('Use [--verify-schedules]')
  expect(transport).not.toHaveBeenCalled()
})

it.each([
  { env: { QSTASH_TOKEN: '' }, error: 'Set QSTASH_TOKEN' },
  { env: { QSTASH_URL: '' }, error: 'Set QSTASH_URL' },
  { env: { QSTASH_URL: 'https://custom.example.com' }, error: 'Upstash QStash HTTPS origin' },
])('requires production provider settings without fallback ($error)', async ({ env, error }) => {
  const transport = stubTransport()
  await expect(
    runQStashCheck(['--production', '--verify-schedules'], { ...fixtureEnv, ...env }),
  ).rejects.toThrow(error)
  expect(transport).not.toHaveBeenCalled()
})

it('limits provider credentials to the reviewed QStash HTTPS API', () => {
  expect(rehearsalQStashOrigin()).toBe('https://qstash.upstash.io')
  expect(rehearsalQStashOrigin('https://qstash-eu-central-1.upstash.io/')).toBe(
    'https://qstash-eu-central-1.upstash.io',
  )
  for (const invalid of [
    'http://qstash.upstash.io',
    'https://qstash.upstash.io:8443',
    'https://qstash.upstash.io/path',
    'https://qstash.upstash.io.invalid.example',
  ]) {
    expect(() => rehearsalQStashOrigin(invalid)).toThrow('Upstash QStash HTTPS origin')
  }
})

it.each([
  [200, 'Unauthorized'],
  [401, 'Login required'],
])(
  'stops when the unsigned request returns %s with an unexpected response',
  async (status, body) => {
    const transport = stubTransport(new Response(body, { status }))
    await expect(runQStashCheck([], fixtureEnv)).rejects.toThrow('reject the unsigned request')
    await expect(
      runQStashCheck(
        ['--production', '--confirm-no-invoice-delivery'],
        fixtureEnv,
        vi.fn<typeof fetch>().mockResolvedValue(new Response(body, { status })),
      ),
    ).rejects.toThrow('reject the unsigned request')
    expect(transport).toHaveBeenCalledExactlyOnceWith(
      destination,
      expect.objectContaining({ method: 'POST' }),
    )
  },
)

it.each([
  {
    args: [],
    origin: rehearsalOrigin,
    provider: fixtureEnv.REHEARSAL_QSTASH_URL,
    token: fixtureEnv.REHEARSAL_QSTASH_TOKEN,
  },
  {
    args: ['--production', '--confirm-no-invoice-delivery'],
    origin: productionOrigin,
    provider: fixtureEnv.QSTASH_URL,
    token: fixtureEnv.QSTASH_TOKEN,
  },
])(
  'checks the signature gate and publishes only a correlation ID to $origin',
  async ({ args, origin, provider, token }) => {
    const destination = `${origin}${invoiceJob}`
    const transport = stubTransport(
      new Response('Unauthorized', { status: 401 }),
      Response.json({ messageId }),
      Response.json({ events: [{ ...log, url: destination }] }),
    )
    const result = await runQStashCheck(args, fixtureEnv)
    expect(result).toEqual({ destination, messageId, rehearsalId: expect.any(String), deliveredAt })
    if (!('rehearsalId' in result)) throw new Error('Expected delivery evidence')
    const body = JSON.stringify({ rehearsalId: result.rehearsalId })
    const [unsigned, publish, events] = transport.mock.calls
    expect(unsigned).toEqual([
      destination,
      {
        method: 'POST',
        body,
        headers: { 'content-type': 'application/json' },
        redirect: 'error',
        signal: expect.any(AbortSignal),
      },
    ])
    const publishUrl = new URL(String(publish?.[0]))
    expect(publishUrl.origin).toBe(provider)
    expect(decodeURI(publishUrl.pathname)).toBe(`/v2/publish/${destination}`)
    const headers = new Headers(publish?.[1]?.headers)
    expect(headers.get('Authorization')).toBe(`Bearer ${token}`)
    expect(headers.get('Upstash-Retries')).toBe('0')
    expect(headers.get('Upstash-Timeout')).toBe('15s')
    expect(publish?.[1]?.body).toBe(body)
    const eventsUrl = new URL(String(events?.[0]))
    expect(eventsUrl.pathname).toBe('/v2/events')
    expect(eventsUrl.searchParams.get('messageIds')).toBe(messageId)
    expect(transport).toHaveBeenCalledTimes(3)
  },
)

it('ignores deliveries for another destination or message ID and rejects a matching failure', async () => {
  stubTransport(
    new Response('Unauthorized', { status: 401 }),
    Response.json({ messageId }),
    Response.json({
      events: [
        { ...log, url: 'https://elsewhere.example/api/jobs/invoice-pdf' },
        { ...log, messageId: 'msg_other' },
        { ...log, state: 'FAILED' },
      ],
    }),
  )
  await expect(runQStashCheck([], fixtureEnv)).rejects.toThrow(
    `failed probe delivery for ${messageId}`,
  )
})

it.each([
  {
    args: ['--verify-schedules'],
    origin: rehearsalOrigin,
    provider: fixtureEnv.REHEARSAL_QSTASH_URL,
  },
  {
    args: ['--production', '--verify-schedules'],
    origin: productionOrigin,
    provider: fixtureEnv.QSTASH_URL,
  },
])('verifies $origin through the read-only schedule list', async ({ args, origin, provider }) => {
  const transport = stubTransport(
    Response.json(
      fixtureSchedules.map((schedule) => ({
        ...schedule,
        destination: schedule.destination.replace(rehearsalOrigin, origin),
      })),
    ),
  )
  const result = await runQStashCheck(args, fixtureEnv)
  expect(result).toMatchObject({ origin, verified: true })
  if (!('verified' in result)) throw new Error('Expected schedule evidence')
  expect(result.checks).toHaveLength(JOB_SCHEDULES.length)
  expect(transport).toHaveBeenCalledExactlyOnceWith(
    `${provider}/v2/schedules`,
    expect.objectContaining({ method: 'GET' }),
  )
})

it('reports missing, duplicate, disabled and unexpected jobs without matching other origins', async () => {
  const [first, second, third, ...rest] = fixtureSchedules
  if (!(first && second && third)) throw new Error('Expected schedule fixtures')
  stubTransport(
    Response.json([
      { ...first, destination: first.destination.replace(domain, 'outside.example.com') },
      second,
      { ...second, scheduleId: 'duplicate', destination: `${second.destination}?copy` },
      { ...third, cron: '* * * * *', isPaused: true, method: 'GET' },
      { ...third, scheduleId: 'unexpected', destination },
      ...rest,
    ]),
  )
  const result = await runQStashCheck(['--verify-schedules'], fixtureEnv)
  if (!('verified' in result)) throw new Error('Expected schedule evidence')
  expect(result.verified).toBe(false)
  expect(result.checks.slice(0, 3)).toEqual([
    { job: JOB_SCHEDULES[0]?.key, status: 'missing' },
    { job: JOB_SCHEDULES[1]?.key, status: 'duplicate', count: 2 },
    {
      job: JOB_SCHEDULES[2]?.key,
      scheduleId: third.scheduleId,
      status: 'mismatch',
      issues: ['cron', 'method', 'paused'],
    },
  ])
  expect(result.unexpected).toEqual([{ scheduleId: 'unexpected', path: '/api/jobs/invoice-pdf' }])
})
