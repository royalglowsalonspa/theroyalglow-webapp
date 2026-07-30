/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 15-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : tests/support/db
 * Scope        : CMS E2E Support — Catalogue Database Access
 *
 * Description  : Read/verify/cleanup helpers used by the Playwright
 *                service-sync E2E suite. Every assertion the suite makes about
 *                Drizzle goes through here, plus the drift/count proofs and the
 *                throwaway-row teardown.
 *
 * Responsibilities :
 * - Read `public.service` / `public.service_category` rows by slug
 * - Report catalogue counts across BOTH schemas (`public.*` and `cms.*`)
 * - Report ID alignment (rows present in one schema but not the other)
 * - Insert the deliberate `public`-only conflict row used by the sync-failure
 *   scenario, and delete every throwaway row afterwards
 *
 * Features / Functionality :
 * - E2E_PREFIX-scoped cleanup so a mid-run failure cannot leave residue
 * - Cross-schema counts + drift check for end-state proof
 *
 * Tech Stack   : Drizzle ORM, @rgss/db (neon-http), PostgreSQL (Neon)
 * Layer        : CMS (Test Support)
 *
 * Dependencies : @rgss/db, @rgss/db/schema, drizzle-orm
 *
 * Notes        :
 * - `apps/cms` cannot resolve `pg` / `@neondatabase/serverless` directly, so
 *   reads go through `@rgss/db`'s neon-http client. That is fine here: this is
 *   OUT-OF-BAND verification from the test process, never the sync write path
 *   (which must stay on Payload's own transaction handle — see sync-db.ts).
 * - `cms.*` tables have no Drizzle definitions in this repo (Payload owns
 *   them), so those statements are raw parameterised SQL.
 ************************************************************/
import { db } from '@rgss/db'
import { service, serviceCategory } from '@rgss/db/schema'
import { eq, sql } from 'drizzle-orm'

/**
 * Every row this suite creates is prefixed so cleanup can be exact and a
 * half-finished run can never be mistaken for real catalogue data.
 */
export const E2E_PREFIX = 'zz-e2e-'

export type CatalogueCounts = {
  publicService: number
  publicCategory: number
  cmsService: number
  cmsCategory: number
}

/** Rows present in one schema but missing from the other. */
export type Drift = {
  serviceOnlyInCms: number
  serviceOnlyInPublic: number
  categoryOnlyInCms: number
  categoryOnlyInPublic: number
}

async function scalar(query: ReturnType<typeof sql>): Promise<number> {
  const result = (await db.execute(query)) as unknown as { rows: { n: number | string }[] }
  return Number(result.rows[0]?.n ?? 0)
}

export async function catalogueCounts(): Promise<CatalogueCounts> {
  const [publicService, publicCategory, cmsService, cmsCategory] = await Promise.all([
    scalar(sql`select count(*) as n from public.service`),
    scalar(sql`select count(*) as n from public.service_category`),
    scalar(sql`select count(*) as n from cms.service`),
    scalar(sql`select count(*) as n from cms.service_category`),
  ])

  return { publicService, publicCategory, cmsService, cmsCategory }
}

/**
 * ID alignment across the two schemas. All four numbers MUST be 0 — the whole
 * point of the custom nanoid `id` override is that `cms.*` and `public.*` share
 * one ID-space.
 */
export async function catalogueDrift(): Promise<Drift> {
  const [serviceOnlyInCms, serviceOnlyInPublic, categoryOnlyInCms, categoryOnlyInPublic] =
    await Promise.all([
      scalar(
        sql`select count(*) as n from cms.service c where not exists (select 1 from public.service p where p.id = c.id)`,
      ),
      scalar(
        sql`select count(*) as n from public.service p where not exists (select 1 from cms.service c where c.id = p.id)`,
      ),
      scalar(
        sql`select count(*) as n from cms.service_category c where not exists (select 1 from public.service_category p where p.id = c.id)`,
      ),
      scalar(
        sql`select count(*) as n from public.service_category p where not exists (select 1 from cms.service_category c where c.id = p.id)`,
      ),
    ])

  return { serviceOnlyInCms, serviceOnlyInPublic, categoryOnlyInCms, categoryOnlyInPublic }
}

export async function findPublicServiceBySlug(
  slug: string,
): Promise<typeof service.$inferSelect | undefined> {
  const rows = await db.select().from(service).where(eq(service.slug, slug)).limit(1)
  return rows[0]
}

export async function findPublicCategoryBySlug(
  slug: string,
): Promise<typeof serviceCategory.$inferSelect | undefined> {
  const rows = await db
    .select()
    .from(serviceCategory)
    .where(eq(serviceCategory.slug, slug))
    .limit(1)
  return rows[0]
}

/** Does a `cms.*` row exist for this slug? Used to prove rollback. */
export async function cmsServiceExists(slug: string): Promise<boolean> {
  return (await scalar(sql`select count(*) as n from cms.service where slug = ${slug}`)) > 0
}

export async function cmsServiceIdBySlug(slug: string): Promise<string | undefined> {
  const result = (await db.execute(
    sql`select id from cms.service where slug = ${slug} limit 1`,
  )) as unknown as { rows: { id: string }[] }
  return result.rows[0]?.id
}

export async function cmsCategoryIdBySlug(slug: string): Promise<string | undefined> {
  const result = (await db.execute(
    sql`select id from cms.service_category where slug = ${slug} limit 1`,
  )) as unknown as { rows: { id: string }[] }
  return result.rows[0]?.id
}

/** Any real category id, used as the FK for the deliberate conflict row. */
export async function anyPublicCategoryId(): Promise<string> {
  const result = (await db.execute(
    sql`select id from public.service_category order by display_order limit 1`,
  )) as unknown as { rows: { id: string }[] }
  const id = result.rows[0]?.id
  if (!id) {
    throw new Error('No rows in public.service_category — the catalogue must be seeded first.')
  }
  return id
}

/**
 * Insert a `public.service` row that has NO counterpart in `cms.service`.
 *
 * This is what makes the sync-failure scenario reachable through the UI: the
 * CMS create passes Payload's own unique-slug check (nothing in `cms.service`
 * holds the slug), then the afterChange hook's insert into `public.service`
 * violates the UNIQUE index on `public.service.slug`. The hook re-throws,
 * Payload rolls the whole transaction back and returns 500.
 */
export async function insertPublicOnlyService(input: {
  id: string
  slug: string
  name: string
  categoryId: string
}): Promise<void> {
  await db.insert(service).values({
    id: input.id,
    categoryId: input.categoryId,
    name: input.name,
    slug: input.slug,
    durationMinutes: 30,
    pricePaise: 100,
    isActive: false,
  })
}

/**
 * Delete every row this suite could have created, in BOTH schemas, plus the
 * throwaway CMS admin user. Safe to call repeatedly and safe to call after a
 * mid-run failure — it is keyed on E2E_PREFIX only, so real catalogue rows are
 * never touched.
 *
 * `cms.*` deletes come first: `public.service.category_id` is ON DELETE RESTRICT,
 * and `cms.payload_locked_documents_rels` cascades from `cms.service`.
 */
export async function cleanupE2eRows(): Promise<void> {
  const prefix = `${E2E_PREFIX}%`

  await db.execute(sql`delete from cms.service where slug like ${prefix}`)
  await db.execute(sql`delete from cms.service_category where slug like ${prefix}`)
  await db.execute(sql`delete from public.service where slug like ${prefix}`)
  await db.execute(sql`delete from public.service_category where slug like ${prefix}`)
  await db.execute(sql`delete from cms.users_sessions where _parent_id in
    (select id from cms.users where email like ${prefix})`)
  await db.execute(sql`delete from cms.users where email like ${prefix}`)
}
