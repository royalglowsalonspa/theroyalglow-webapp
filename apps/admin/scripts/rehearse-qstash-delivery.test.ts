import { Client } from '@upstash/qstash'
import { expect, it, vi } from 'vitest'
import { rehearsalQStashOrigin } from '../../../scripts/release/rehearsal-config'
import { JOB_SCHEDULES } from '../src/lib/jobs/schedules'
import { rehearseQStashDelivery, verifyRehearsalSchedules } from './rehearse-qstash-delivery'

const domain = 'fixture.example.com'
const destination = `https://admin.${domain}/api/jobs/invoice-pdf`
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

function dependencies(response = new Response('Unauthorized', { status: 401 })) {
  return {
    request: vi.fn<typeof fetch>().mockResolvedValue(response),
    client: {
      publishJSON: vi.fn().mockResolvedValue({ messageId }),
      logs: vi.fn().mockResolvedValue({ logs: [log] }),
    },
  }
}

it('does not contact the origin or QStash when given a production domain', async () => {
  const { request, client } = dependencies()
  await expect(rehearseQStashDelivery('fixture.theroyalglow.in', client, request)).rejects.toThrow(
    'isolated SST rehearsal domain',
  )
  expect(request).not.toHaveBeenCalled()
  expect(client.publishJSON).not.toHaveBeenCalled()
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
    const { request, client } = dependencies(new Response(body, { status }))
    await expect(rehearseQStashDelivery(domain, client, request)).rejects.toThrow(
      'reject the unsigned request',
    )
    expect(client.publishJSON).not.toHaveBeenCalled()
  },
)

it('checks an unsigned request and publishes exactly one synthetic message without an invoice ID', async () => {
  const { request, client } = dependencies()
  const evidence = await rehearseQStashDelivery(domain, client, request)
  expect(evidence).toEqual({ destination, messageId, rehearsalId: expect.any(String), deliveredAt })
  const body = { rehearsalId: evidence.rehearsalId }
  expect(request).toHaveBeenCalledWith(
    destination,
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
      redirect: 'error',
    }),
  )
  expect(client.publishJSON).toHaveBeenCalledExactlyOnceWith({
    url: destination,
    body,
    retries: 0,
    timeout: 15,
  })
  expect(client.logs).toHaveBeenCalledExactlyOnceWith({ messageIds: [messageId] })
})

it('uses the real SDK to publish one message and fetch its provider event', async () => {
  const { request } = dependencies()
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ messageId }))
    .mockResolvedValueOnce(Response.json({ events: [log] }))
  vi.stubGlobal('fetch', transport)
  try {
    const baseUrl = 'https://qstash-eu-central-1.upstash.io'
    const client = new Client({ baseUrl, token: 'synthetic-token', retry: false, devMode: false })
    const result = await rehearseQStashDelivery(domain, client, request)
    const [publish, events] = transport.mock.calls
    const publishUrl = new URL(String(publish?.[0]))
    expect(publishUrl.origin).toBe(baseUrl)
    expect(decodeURI(publishUrl.pathname)).toBe(`/v2/publish/${destination}`)
    const headers = new Headers(publish?.[1]?.headers)
    expect(headers.get('Upstash-Retries')).toBe('0')
    expect(headers.get('Upstash-Timeout')).toBe('15s')
    expect(publish?.[1]?.body).toBe(JSON.stringify({ rehearsalId: result.rehearsalId }))
    const eventsUrl = new URL(String(events?.[0]))
    expect(eventsUrl.pathname).toBe('/v2/events')
    expect(eventsUrl.searchParams.get('messageIds')).toBe(messageId)
    expect(transport).toHaveBeenCalledTimes(2)
  } finally {
    vi.unstubAllGlobals()
  }
})

it('ignores deliveries for another destination or message ID and rejects a matching failure', async () => {
  const { request, client } = dependencies()
  client.logs.mockResolvedValue({
    logs: [
      { ...log, url: 'https://elsewhere.example/api/jobs/invoice-pdf' },
      { ...log, messageId: 'msg_other' },
      { ...log, state: 'FAILED' },
    ],
  })
  await expect(rehearseQStashDelivery(domain, client, request)).rejects.toThrow(
    `failed rehearsal delivery for ${messageId}`,
  )
})

it('verifies the stage schedules through the read-only list operation', async () => {
  const list = vi.fn().mockResolvedValue(fixtureSchedules)
  const result = await verifyRehearsalSchedules(domain, { list })
  expect(result.verified).toBe(true)
  expect(result.checks).toHaveLength(JOB_SCHEDULES.length)
  expect(list).toHaveBeenCalledTimes(1)
})

it('reports missing, duplicate, disabled and unexpected jobs without matching other origins', async () => {
  const [first, second, third, ...rest] = fixtureSchedules
  if (!(first && second && third)) throw new Error('Expected schedule fixtures')
  const list = vi
    .fn()
    .mockResolvedValue([
      { ...first, destination: first.destination.replace(domain, 'outside.example.com') },
      second,
      { ...second, scheduleId: 'duplicate', destination: `${second.destination}?copy` },
      { ...third, cron: '* * * * *', isPaused: true, method: 'GET' },
      { ...third, scheduleId: 'unexpected', destination },
      ...rest,
    ])
  const result = await verifyRehearsalSchedules(domain, { list })
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
