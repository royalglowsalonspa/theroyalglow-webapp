import { db } from '@rgss/db'
import { sql } from 'drizzle-orm'

// Liveness/health endpoint per deployment.md. Probed by BetterStack, CI, and
// load balancers, so it returns its own documented contract (NOT the app's
// { success, data } envelope) and its own status codes.
//
// Guarded by design: the database is the only hard dependency. Redis and R2
// are optional — when their env vars are absent the check reports `skip`, which
// never degrades the overall status, so a no-keys local/dev environment is
// `healthy` with a 200. Every check is wrapped so the handler never throws.

type CheckStatus = 'pass' | 'fail' | 'skip'

type ComponentHealth = {
  status: CheckStatus
  latencyMs: number
  message?: string
}

type OverallStatus = 'healthy' | 'degraded' | 'unhealthy'

type HealthStatus = {
  status: OverallStatus
  timestamp: string
  version: string
  uptime: number
  checks: {
    database: ComponentHealth
    redis: ComponentHealth
    r2: ComponentHealth
  }
}

async function checkDatabase(): Promise<ComponentHealth> {
  const start = Date.now()
  try {
    await db.execute(sql`SELECT 1`)
    return { status: 'pass', latencyMs: Date.now() - start }
  } catch {
    return {
      status: 'fail',
      latencyMs: Date.now() - start,
      message: 'DB unreachable',
    }
  }
}

async function checkRedis(): Promise<ComponentHealth> {
  const start = Date.now()
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!(url && token)) {
    return { status: 'skip', latencyMs: 0, message: 'Redis not configured' }
  }
  try {
    const res = await fetch(`${url}/ping`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    return res.ok
      ? { status: 'pass', latencyMs: Date.now() - start }
      : {
          status: 'fail',
          latencyMs: Date.now() - start,
          message: `Redis HTTP ${res.status}`,
        }
  } catch {
    return {
      status: 'fail',
      latencyMs: Date.now() - start,
      message: 'Redis unreachable',
    }
  }
}

async function checkR2(): Promise<ComponentHealth> {
  const start = Date.now()
  const publicUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL
  if (!publicUrl) {
    return { status: 'skip', latencyMs: 0, message: 'R2 not configured' }
  }
  try {
    const res = await fetch(`${publicUrl.replace(/\/+$/, '')}/.health`, {
      method: 'HEAD',
      cache: 'no-store',
    })
    return res.ok
      ? { status: 'pass', latencyMs: Date.now() - start }
      : {
          status: 'fail',
          latencyMs: Date.now() - start,
          message: `R2 HTTP ${res.status}`,
        }
  } catch {
    return {
      status: 'fail',
      latencyMs: Date.now() - start,
      message: 'R2 unreachable',
    }
  }
}

function settled(result: PromiseSettledResult<ComponentHealth>): ComponentHealth {
  return result.status === 'fulfilled'
    ? result.value
    : { status: 'fail', latencyMs: 0, message: 'Check threw' }
}

export async function GET(): Promise<Response> {
  const [dbResult, redisResult, r2Result] = await Promise.allSettled([
    checkDatabase(),
    checkRedis(),
    checkR2(),
  ])

  const database = settled(dbResult)
  const redis = settled(redisResult)
  const r2 = settled(r2Result)

  // The database is the only hard dependency. A `skip` never degrades; a
  // configured-but-failing Redis/R2 yields `degraded` while DB is up.
  let status: OverallStatus
  if (database.status === 'fail') {
    status = 'unhealthy'
  } else if (redis.status === 'fail' || r2.status === 'fail') {
    status = 'degraded'
  } else {
    status = 'healthy'
  }

  const body: HealthStatus = {
    status,
    timestamp: new Date().toISOString(),
    version: process.env.COMMIT_SHA ?? 'unknown',
    uptime: process.uptime?.() ?? 0,
    checks: { database, redis, r2 },
  }

  return Response.json(body, {
    status: status === 'unhealthy' ? 503 : 200,
    headers: {
      'Cache-Control': 'no-store',
      'X-Health-Status': status,
    },
  })
}
