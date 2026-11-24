/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 31-10-2026 & Updated - 31-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : catalogue-branches (endpoint)
 * Scope        : CMS Endpoints — branch list for catalogue availability
 *
 * Description  : GET /api/catalogue-branches. The branches a category or
 *                service can be offered at, for the availability picker
 *                (catalogue-availability.md). Branches are managed in the
 *                admin portal and live in `public.branch`; the CMS only
 *                reads them.
 *
 * Responsibilities :
 * - Answer 401 without a signed-in CMS login
 * - Return id, name, code and status of every branch, in display order
 *
 * Tech Stack   : Payload CMS v3, Drizzle ORM
 * Layer        : CMS (Endpoint)
 *
 * Dependencies : payload, drizzle-orm, ../lib/sync-db
 *
 * Notes        : Read-only; no transaction is open, so txDb(req) resolves to
 *                the adapter's connection. The picker hides shut-down
 *                branches unless already chosen.
 ************************************************************/
import { asc } from 'drizzle-orm'
import type { Endpoint, PayloadHandler } from 'payload'
import type { CatalogueBranch } from '../components/branch-options'
import { branch, txDb } from '../lib/sync-db'

export const catalogueBranchesHandler: PayloadHandler = async (req) => {
  if (!req.user) {
    return Response.json({ errors: [{ message: 'Sign in to the CMS first.' }] }, { status: 401 })
  }
  const db = await txDb(req)
  const branches: CatalogueBranch[] = await db
    .select({ id: branch.id, name: branch.name, code: branch.code, status: branch.status })
    .from(branch)
    .orderBy(asc(branch.displayOrder), asc(branch.number))
  return Response.json({ branches }, { headers: { 'Cache-Control': 'no-store' } })
}

export const catalogueBranchesEndpoint: Endpoint = {
  path: '/catalogue-branches',
  method: 'get',
  handler: catalogueBranchesHandler,
}
