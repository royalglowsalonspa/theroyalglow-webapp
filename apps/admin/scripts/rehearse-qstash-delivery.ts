import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { Client } from '@upstash/qstash'
import { rehearsalDomain, rehearsalQStashOrigin } from '../../../scripts/release/rehearsal-config'
import { JOB_SCHEDULES } from '../src/lib/jobs/schedules'

const INVOICE_JOB = '/api/jobs/invoice-pdf'
const POLL_INTERVAL_MS = 2000
const MAX_POLLS = 20
const END_STATES = new Set(['FAILED', 'CANCELED', 'CANCELLED'])

type QStashClient = Pick<Client, 'publishJSON' | 'logs'>

class RehearsalError extends Error {}

export async function verifyRehearsalSchedules(
  domain: string,
  schedules: Pick<Client['schedules'], 'list'>,
) {
  const origin = `https://admin.${rehearsalDomain(domain)}`
  const registered = (await schedules.list()).flatMap((schedule) => {
    const url = URL.parse(schedule.destination)
    return url?.origin === origin && url.pathname.startsWith('/api/jobs/')
      ? [{ schedule, path: url.pathname.replace(/\/$/, '') }]
      : []
  })
  const expectedPaths = new Set(JOB_SCHEDULES.map((job) => job.path))
  const unexpected = registered
    .filter(({ path }) => !expectedPaths.has(path))
    .map(({ schedule, path }) => ({ scheduleId: schedule.scheduleId, path }))
  const checks = JOB_SCHEDULES.map((job) => {
    const matches = registered.filter(({ path }) => path === job.path)
    const [match] = matches
    if (!match) return { job: job.key, status: 'missing' as const }
    if (matches.length !== 1) {
      return { job: job.key, status: 'duplicate' as const, count: matches.length }
    }
    const { schedule } = match
    const expectedDestination = `${origin}${job.path}`
    const issues = [
      ...(schedule.destination !== expectedDestination ? ['destination'] : []),
      ...(schedule.cron.trim().replace(/\s+/g, ' ') !== job.cron ? ['cron'] : []),
      ...(schedule.method !== 'POST' ? ['method'] : []),
      ...(schedule.isPaused !== false ? ['paused'] : []),
    ]
    return {
      job: job.key,
      scheduleId: schedule.scheduleId,
      status: issues.length ? ('mismatch' as const) : ('verified' as const),
      ...(issues.length ? { issues } : {}),
    }
  })
  return {
    origin,
    checks,
    unexpected,
    verified: !unexpected.length && checks.every((check) => check.status === 'verified'),
  }
}

export async function rehearseQStashDelivery(
  domain: string,
  client: QStashClient,
  request: typeof fetch = fetch,
) {
  const destination = `https://admin.${rehearsalDomain(domain)}${INVOICE_JOB}`
  // The invoice job checks for an invoiceId before reading the database or
  // contacting invoicing or mail. A correlation ID is the only payload field.
  const body = { rehearsalId: randomUUID() }
  const unsigned = await request(destination, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  })
  if (unsigned.status !== 401 || (await unsigned.text()) !== 'Unauthorized') {
    throw new RehearsalError(
      'The rehearsal invoice job must reject the unsigned request before publishing',
    )
  }

  const { messageId } = await client.publishJSON({
    url: destination,
    body,
    retries: 0,
    timeout: 15,
  })
  if (typeof messageId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(messageId)) {
    throw new RehearsalError('QStash did not return a rehearsal message ID')
  }

  for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
    const { logs } = await client.logs({ messageIds: [messageId] })
    const exact = logs.filter((log) => log.messageId === messageId && log.url === destination)
    const delivered = exact.find((log) => log.state === 'DELIVERED')
    if (delivered) {
      return {
        destination,
        messageId,
        rehearsalId: body.rehearsalId,
        deliveredAt: new Date(delivered.time).toISOString(),
      }
    }
    if (exact.some((log) => END_STATES.has(log.state))) {
      throw new RehearsalError(`QStash reported a failed rehearsal delivery for ${messageId}`)
    }
    if (attempt < MAX_POLLS - 1)
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }
  throw new RehearsalError(`No matching QStash delivery log appeared for ${messageId}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [mode, ...extra] = process.argv.slice(2)
    if (extra.length || (mode !== undefined && mode !== '--verify-schedules')) {
      throw new RehearsalError(
        'Usage: bun apps/admin/scripts/rehearse-qstash-delivery.ts [--verify-schedules]',
      )
    }
    let domain: string
    let baseUrl: string
    try {
      domain = rehearsalDomain(process.env.REHEARSAL_DOMAIN ?? '')
      baseUrl = rehearsalQStashOrigin(process.env.REHEARSAL_QSTASH_URL)
    } catch (error) {
      throw new RehearsalError(
        error instanceof Error ? error.message : 'Invalid rehearsal settings',
      )
    }
    const token = process.env.REHEARSAL_QSTASH_TOKEN
    if (!token?.trim()) {
      throw new RehearsalError('Set REHEARSAL_QSTASH_TOKEN to the isolated provider token')
    }
    const client = new Client({
      token,
      baseUrl,
      retry: false,
      devMode: false,
      enableTelemetry: false,
    })
    if (mode === '--verify-schedules') {
      const result = await verifyRehearsalSchedules(domain, client.schedules)
      console.log(JSON.stringify(result))
      if (!result.verified) process.exitCode = 2
    } else {
      console.log(JSON.stringify(await rehearseQStashDelivery(domain, client)))
    }
  } catch (error) {
    // Provider errors can contain request contents. Emit only our own safe text.
    console.error(error instanceof RehearsalError ? error.message : 'The QStash rehearsal failed')
    process.exitCode = 1
  }
}
