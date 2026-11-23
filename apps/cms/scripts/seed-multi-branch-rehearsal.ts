import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { getPayload } from 'payload'
import { txDb } from '../src/lib/sync-db'

const catalogue = [
  {
    category: {
      id: 'rehearsal_mb_category_hair',
      name: 'Hair and Styling (Rehearsal)',
      slug: 'rehearsal-hair-styling',
      serviceType: 'salon',
      sacCode: '999721',
    },
    service: {
      id: 'rehearsal_mb_service_haircut',
      name: 'Wash, Cut and Finish (Rehearsal)',
      slug: 'rehearsal-wash-cut-finish',
      durationMinutes: '45',
      pricePaise: 85_000,
    },
  },
  {
    category: {
      id: 'rehearsal_mb_category_spa',
      name: 'SPA Body Therapies (Rehearsal)',
      slug: 'rehearsal-spa-body-therapies',
      serviceType: 'spa',
      sacCode: '999723',
    },
    service: {
      id: 'rehearsal_mb_service_massage',
      name: 'Aromatherapy Massage (Rehearsal)',
      slug: 'rehearsal-aromatherapy-massage',
      durationMinutes: '60',
      pricePaise: 155_000,
    },
  },
] as const

async function main(): Promise<void> {
  const url = URL.parse(process.env.REHEARSAL_DATABASE_URL ?? '')
  if (
    !url ||
    !['postgresql:', 'postgres:'].includes(url.protocol) ||
    !['127.0.0.1', '[::1]'].includes(url.hostname) ||
    !/^\/rgss_rehearsal_[a-z0-9_]+$/.test(url.pathname) ||
    url.searchParams.has('host') ||
    url.searchParams.has('hostaddr')
  ) {
    throw new Error('Use a disposable loopback database URL named rgss_rehearsal_<name>')
  }

  // The Local API still runs the real catalogue mirror hooks. Disable outbound
  // effects and use only the exact connection above when importing the config.
  process.env.DATABASE_URL = url.href
  process.env.PAYLOAD_SECRET = randomUUID()
  process.env.PAYLOAD_PUBLIC_SERVER_URL = 'http://127.0.0.1:3002'
  process.env.SERVICE_SYNC_ENABLED = 'true'
  delete process.env.WEB_APP_URL
  delete process.env.RESEND_API_KEY
  delete process.env.R2_BUCKET_NAME

  const { default: config } = await import('../src/payload.config')
  const payload = await getPayload({ config })
  try {
    const db = await txDb({ payload })
    const readiness = await db.execute<{ ready: boolean }>(sql`
      SELECT current_database() = ${url.pathname.slice(1)}
        AND inet_server_addr() IN ('127.0.0.1', '::1')
        AND (SELECT array_agg(id ORDER BY id) FROM branch) = ARRAY[
          'rehearsal_mb_a', 'rehearsal_mb_b', 'rehearsal_mb_c'
        ]
        AND EXISTS (SELECT 1 FROM system_setting WHERE key = 'invoicing' AND value->'live' = 'false'::jsonb)
        AS ready
    `)
    if (!readiness.rows[0]?.ready) {
      throw new Error('Apply the local branch rehearsal seed before adding the rehearsal catalogue')
    }

    for (const { category, service } of catalogue) {
      const existingCategory = await payload.findByID({
        collection: 'service_category',
        id: category.id,
        disableErrors: true,
      })
      if (!existingCategory) {
        await payload.create({
          collection: 'service_category',
          data: { ...category, availability: 'all', isActive: true },
        })
      }
      const existingService = await payload.findByID({
        collection: 'service',
        id: service.id,
        disableErrors: true,
      })
      if (!existingService) {
        await payload.create({
          collection: 'service',
          data: { ...service, categoryId: category.id, availability: 'all', isActive: true },
        })
      }
    }
    console.log(
      'Rehearsal catalogue is ready. Rerun the branch seed to assign therapists and stylists.',
    )
  } finally {
    await payload.destroy()
  }
}

await main()
// Payload can leave a cron timer active even after closing its database pool.
process.exit(0)
