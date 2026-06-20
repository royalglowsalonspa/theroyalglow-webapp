/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : GET /api/health (admin)
 * Scope        : API — Public (health probe)
 *
 * Description  : Liveness/readiness probe for the admin app. Pings the database
 *                via @rgss/db and reports overall health. Consumed by the
 *                deploy workflow's post-deploy health check against
 *                https://admin.theroyalglow.in/api/health.
 *
 * Responsibilities :
 * - Execute a lightweight DB ping (SELECT 1) through the shared @rgss/db client
 * - Return 200 { status: 'healthy' } when the DB is reachable
 * - Return 503 { status: 'unhealthy' } when the DB ping fails
 *
 * Tech Stack   : Next.js 16 (Route Handler), Drizzle ORM, Neon
 * Layer        : API (Thin probe — no business logic)
 *
 * Dependencies : @rgss/db, drizzle-orm
 *
 * Notes        :
 * - Unauthenticated: excluded from the RBAC middleware matcher (api/health).
 * - Forced dynamic + Node.js runtime so the DB ping runs per-request.
 ************************************************************/

import { db } from '@rgss/db'
import { sql } from 'drizzle-orm'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  try {
    await db.execute(sql`select 1`)
    return Response.json({ status: 'healthy' }, { status: 200 })
  } catch {
    return Response.json({ status: 'unhealthy' }, { status: 503 })
  }
}
