// biome-ignore-all lint/suspicious/noUndeclaredEnvVars: Private Lambda rehearsal outside Turbo.
import { db } from '@rgss/db'
import { sql } from 'drizzle-orm'
import { GET as health } from '../src/app/api/health/route'

const FUNCTION_NAME = /^rgss-rehearsal-mb[0-9]+-driver$/
const NEON_HOST = /^ep-[a-z0-9-]+(?:\.[a-z0-9-]+)*\.ap-southeast-1\.aws\.neon\.tech$/
const REQUEST_ID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i
const DATABASE = 'rgss_rehearsal_driver'
const ROLE = 'rgss_rehearsal_probe'
const GUARD = 'rgss_rehearsal_positive_amount'

export function verifyDriverEnvironment(env: Readonly<Record<string, string | undefined>>) {
  const host = env.REHEARSAL_DRIVER_NEON_HOST ?? ''
  const url = URL.parse(env.DATABASE_URL ?? '')
  if (
    !FUNCTION_NAME.test(env.AWS_LAMBDA_FUNCTION_NAME ?? '') ||
    env.AWS_REGION !== 'ap-southeast-1' ||
    !NEON_HOST.test(host) ||
    url?.protocol !== 'postgresql:' ||
    url.hostname !== host ||
    (url.port && url.port !== '5432') ||
    url.pathname !== `/${DATABASE}` ||
    url.username !== ROLE ||
    !url.password ||
    !['require', 'verify-full'].includes(url.searchParams.get('sslmode') ?? '')
  ) {
    throw new Error('Use the dedicated Singapore Lambda and synthetic Neon database and role')
  }
}

function guardFailure(error: unknown) {
  const cause = error instanceof Error ? error.cause : undefined
  return [error, cause].some(
    (value) =>
      typeof value === 'object' &&
      value !== null &&
      'code' in value &&
      value.code === '23514' &&
      'constraint' in value &&
      value.constraint === GUARD,
  )
}

export async function handler(
  _event: unknown,
  { awsRequestId, logStreamName }: { awsRequestId: string; logStreamName: string },
) {
  verifyDriverEnvironment(process.env)
  if (!REQUEST_ID.test(awsRequestId) || !logStreamName) {
    throw new Error('Run the rehearsal through a synchronous Lambda invocation')
  }

  const started = performance.now()
  const response = await health()
  const healthMs = performance.now() - started
  if (response.status !== 200) throw new Error('The admin database health route failed')

  const {
    rows: [identity],
  } = await db.execute<{ database: string; role: string }>(
    sql`select current_database() as database, current_user as role`,
  )
  if (identity?.database !== DATABASE || identity.role !== ROLE) {
    throw new Error('Neon returned an unexpected database or login role')
  }

  try {
    await db.batch([
      db.execute(sql`
        insert into rgss_rehearsal.driver_probe(request_id, amount)
        values (${awsRequestId}, 1)
      `),
      db.execute(sql`
        insert into rgss_rehearsal.driver_probe(request_id, amount)
        values (${`${awsRequestId}-guard`}, 0)
      `),
    ])
    throw new Error('The synthetic guard unexpectedly accepted the batch')
  } catch (error) {
    if (!guardFailure(error)) throw new Error('The expected check constraint did not fail')
  }

  const {
    rows: [count],
  } = await db.execute<{ remaining: number }>(sql`
    select count(*)::int as remaining from rgss_rehearsal.driver_probe
    where request_id in (${awsRequestId}, ${`${awsRequestId}-guard`})
  `)
  if (count?.remaining !== 0) throw new Error('The synthetic batch did not roll back')

  return { requestId: awsRequestId, logStreamName, healthMs, rolledBack: true }
}
