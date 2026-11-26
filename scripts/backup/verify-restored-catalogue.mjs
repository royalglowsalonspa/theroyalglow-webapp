import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { SQL } from 'bun'
import { readServiceDriftSnapshot } from '../../packages/db/src/queries/service-drift-snapshot.ts'

const candidate = process.argv[2]
const url = 'postgresql://postgres@127.0.0.1:5432/restore_check?sslmode=disable'
const candidateJobs = pathToFileURL(`${resolve(candidate, 'packages/business/src/jobs')}/`)
const { buildServiceDriftReport } = await import(new URL('service-drift.ts', candidateJobs).href)
const { withOfferDrift } = await import(new URL('offer-drift.ts', candidateJobs).href)
const candidateReader = pathToFileURL(
  resolve(candidate, 'packages/db/src/queries/service-drift-snapshot.ts'),
)
// Older release manifests predate the extraction of the shared reader.
const readSnapshot = (await Bun.file(candidateReader).exists())
  ? (await import(candidateReader.href)).readServiceDriftSnapshot
  : readServiceDriftSnapshot
const database = new SQL(url, { max: 1 })

try {
  const snapshot = await database.begin(
    'ISOLATION LEVEL REPEATABLE READ READ ONLY',
    async (sql) => {
      const [{ transaction_read_only: readOnly }] = await sql`SHOW transaction_read_only`
      if (readOnly !== 'on')
        throw new Error('Catalogue verification requires a read-only transaction.')
      await sql`SET LOCAL search_path = pg_catalog, public`
      await sql`SET LOCAL TIME ZONE 'UTC'`
      return readSnapshot((statement) => sql.unsafe(statement))
    },
  )
  const report = withOfferDrift(buildServiceDriftReport(snapshot), snapshot.offers)
  const counts = Object.fromEntries(
    report.tables.map(({ table, cmsRowCount, publicRowCount }) => [
      table,
      { cms: cmsRowCount, public: publicRowCount },
    ]),
  )
  console.log(JSON.stringify({ findings: report.findingCount, counts }))
  if (report.hasDrift) process.exitCode = 2
} finally {
  await database.close()
}
