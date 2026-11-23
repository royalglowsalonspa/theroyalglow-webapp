import { expect, test } from 'bun:test'
import { randomInt } from 'node:crypto'
import { SQL } from 'bun'
import { buildPreview } from './preview-cleanup.mjs'

const url = Bun.env.CLEANUP_PREVIEW_DATABASE_URL
const host = Bun.env.CLEANUP_PREVIEW_FIXTURE_HOST

test.skipIf(!url || !host)(
  'previews an exact CMS fixture, blocks unreviewed links and preserves an unrelated offer',
  async () => {
    if (new URL(url).hostname !== host) throw new Error('Wrong disposable fixture endpoint')
    const db = new SQL(url, { max: 1 })
    const id = -randomInt(1_000_000, 2_000_000_000)
    const otherId = id - 1
    const mirror = `cms_offer_${id}`
    const record = (table, key) => ({ table, key, evidenceReference: 'synthetic fixture' })
    const cms = record('cms.offer', { id: String(id) })
    const version = record('cms._offer_v', { id: String(id) })
    const publicOffer = record('public.offer', { id: mirror })
    const input = (rows) => ({ reviewReference: 'fixture', dumpSha256: 'a'.repeat(64), rows })
    let seeded = false
    try {
      await db.begin(async (sql) => {
        await sql`INSERT INTO cms.offer (id, title) VALUES (${id}, 'Fixture offer'), (${otherId}, 'Retained fixture')`
        await sql`INSERT INTO cms._offer_v (id, parent_id, version_title) VALUES (${id}, ${id}, 'Fixture history')`
        await sql`
          INSERT INTO public.offer (id, name, slug, offer_type, discount_percentage, start_date, end_date, cms_id)
          VALUES (${mirror}, 'Fixture mirror', ${mirror}, 'percentage', 10, '2026-01-01', '2026-01-31', ${id})
        `
      })
      seeded = true

      const blocked = await buildPreview(db, input([cms]))
      expect(blocked.status).toBe('database_review_blocked')
      expect(blocked.dependencies).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ table: version.table, key: version.key, reviewed: false }),
          expect.objectContaining({
            table: publicOffer.table,
            key: publicOffer.key,
            reviewed: false,
          }),
        ]),
      )
      expect((await buildPreview(db, input([publicOffer]))).status).toBe('database_review_blocked')
      const reviewed = await buildPreview(db, input([cms, version, publicOffer]))
      expect(reviewed.status).toBe('database_review_complete')
      expect(reviewed.tableCounts).toEqual({ 'cms._offer_v': 1, 'cms.offer': 1, 'public.offer': 1 })
      expect(
        (await buildPreview(db, input([record('cms.offer', { id: '0' })]))).missing,
      ).toHaveLength(1)

      // Rehearse exact cleanup in the test clone with the same three keys.
      await db.begin(async (sql) => {
        await sql`DELETE FROM public.offer WHERE id = ${mirror} AND cms_id = ${id}`
        await sql`DELETE FROM cms._offer_v WHERE id = ${id} AND parent_id = ${id}`
        await sql`DELETE FROM cms.offer WHERE id = ${id}`
      })
      expect((await buildPreview(db, input([cms, version, publicOffer]))).missing).toHaveLength(3)
      expect(await db`SELECT id FROM cms.offer WHERE id = ${otherId}`).toHaveLength(1)
    } finally {
      if (seeded) {
        await db.begin(async (sql) => {
          await sql`DELETE FROM public.offer WHERE id = ${mirror} AND cms_id = ${id}`
          await sql`DELETE FROM cms._offer_v WHERE id = ${id} AND parent_id = ${id}`
          await sql`DELETE FROM cms.offer WHERE id IN (${id}, ${otherId})`
        })
      }
      await db.close()
    }
  },
  45000,
)
