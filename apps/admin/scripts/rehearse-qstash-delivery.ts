import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { Client } from '@upstash/qstash'
import { rehearsalDomain, rehearsalQStashOrigin } from '../../../scripts/release/rehearsal-config'
import { JOB_SCHEDULES } from '../src/lib/jobs/schedules'

const INVOICE_JOB = '/api/jobs/invoice-pdf'
const PRODUCTION_ADMIN_ORIGIN = 'https://admin.theroyalglow.in'
const POLL_INTERVAL_MS = 2000
const MAX_POLLS = 20
const END_STATES = new Set(['FAILED', 'CANCELED', 'CANCELLED'])

type QStashClient = Pick<Client, 'publishJSON' | 'logs'>
type Environment = Readonly<Record<string, string | undefined>>

class QStashCheckError extends Error {}

async function verifySchedules(origin: string, schedules: Pick<Client['schedules'], 'list'>) {
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
    if (!match)
      return {
        job: job.key,
        status: job.optIn ? ('not-configured' as const) : ('missing' as const),
      }
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
    verified:
      !unexpected.length &&
      checks.every(({ status }) => status === 'verified' || status === 'not-configured'),
  }
}

async function verifySignedDelivery(origin: string, client: QStashClient, request: typeof fetch) {
  const destination = `${origin}${INVOICE_JOB}`
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
    throw new QStashCheckError('The invoice job must reject the unsigned request before publishing')
  }

  const { messageId } = await client.publishJSON({
    url: destination,
    body,
    retries: 0,
    timeout: 15,
  })
  if (typeof messageId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(messageId)) {
    throw new QStashCheckError('QStash did not return a probe message ID')
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
      throw new QStashCheckError(`QStash reported a failed probe delivery for ${messageId}`)
    }
    if (attempt < MAX_POLLS - 1)
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }
  throw new QStashCheckError(`No matching QStash delivery log appeared for ${messageId}`)
}

function readCheckConfig(args: readonly string[], env: Environment) {
  const [mode, productionAction, ...extra] = args
  const production = mode === '--production'
  const verifyOnly = (production ? productionAction : mode) === '--verify-schedules'
  const validCommand = production
    ? extra.length === 0 && (verifyOnly || productionAction === '--confirm-no-invoice-delivery')
    : args.length === 0 || (args.length === 1 && verifyOnly)
  if (!validCommand) {
    throw new QStashCheckError(
      'Use [--verify-schedules] for rehearsal, or --production followed by --verify-schedules or --confirm-no-invoice-delivery',
    )
  }

  const provider = production ? env.QSTASH_URL : env.REHEARSAL_QSTASH_URL
  if (production && !provider?.trim()) {
    throw new QStashCheckError('Set QSTASH_URL to the current production QStash HTTPS origin')
  }
  let origin: string
  let baseUrl: string
  try {
    origin = production
      ? PRODUCTION_ADMIN_ORIGIN
      : `https://admin.${rehearsalDomain(env.REHEARSAL_DOMAIN ?? '')}`
    baseUrl = rehearsalQStashOrigin(provider)
  } catch (error) {
    throw new QStashCheckError(error instanceof Error ? error.message : 'Invalid QStash settings')
  }
  const tokenName = production ? 'QSTASH_TOKEN' : 'REHEARSAL_QSTASH_TOKEN'
  const token = env[tokenName]?.trim()
  if (!token) {
    throw new QStashCheckError(`Set ${tokenName} to the QStash token for this target`)
  }
  return { origin, baseUrl, token, verifyOnly }
}

export async function runQStashCheck(
  args: readonly string[],
  env: Environment,
  request: typeof fetch = fetch,
) {
  const { origin, baseUrl, token, verifyOnly } = readCheckConfig(args, env)
  const client = new Client({
    token,
    baseUrl,
    retry: false,
    devMode: false,
    enableTelemetry: false,
  })
  return verifyOnly
    ? verifySchedules(origin, client.schedules)
    : verifySignedDelivery(origin, client, request)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await runQStashCheck(process.argv.slice(2), process.env)
    console.log(JSON.stringify(result))
    if ('verified' in result && !result.verified) process.exitCode = 2
  } catch (error) {
    // Provider errors can contain request contents. Emit only our own safe text.
    console.error(error instanceof QStashCheckError ? error.message : 'The QStash check failed')
    process.exitCode = 1
  }
}
