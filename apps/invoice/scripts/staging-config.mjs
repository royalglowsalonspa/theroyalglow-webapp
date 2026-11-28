import { fileURLToPath } from 'node:url'
import { z } from 'zod'

const accountId = '6493306f4e280b245bc0b862c64cd9ef'
const stagingName = 'rgss-invoice-staging'
export const stagingHost = 'invoice-staging.theroyalglow.in'
const allowedObjects = {
  PDF: 'InvoicePdf',
  ACCESS_SYNC: 'InvoiceAccessSync',
  REGISTER: 'InvoiceRegister',
}
const placeholder = '00000000-0000-0000-0000-000000000000'

const inputs = z.object({
  INVOICE_STAGING_ACCOUNT_ID: z.literal(accountId),
  INVOICE_STAGING_D1_ID: z
    .uuid()
    .toLowerCase()
    .refine((id) => id !== placeholder),
  INVOICE_STAGING_ACCESS_TEAM: z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/),
  INVOICE_STAGING_ACCESS_AUDIENCE: z.string().regex(/^[a-f0-9]{64}$/),
  INVOICE_STAGING_DEVELOPER_EMAIL: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email().endsWith('@gmail.com')),
})

const workerTemplate = z.strictObject({
  name: z.literal(stagingName),
  main: z.literal('src/worker.ts'),
  compatibility_date: z.iso.date(),
  workers_dev: z.literal(false),
  preview_urls: z.literal(false),
  rules: z.array(
    z.strictObject({
      type: z.literal('Data'),
      globs: z.array(z.string()),
      fallthrough: z.boolean(),
    }),
  ),
  triggers: z.strictObject({ crons: z.array(z.string()) }),
  vars: z.strictObject({ BILLING_SOURCE: z.literal('staging') }),
  d1_databases: z.tuple([
    z.strictObject({
      binding: z.literal('DB'),
      database_name: z.literal(stagingName),
      database_id: z.literal(placeholder),
    }),
  ]),
  r2_buckets: z.tuple([
    z.strictObject({ binding: z.literal('FILES'), bucket_name: z.literal(stagingName) }),
  ]),
  durable_objects: z.strictObject({
    bindings: z.array(z.strictObject({ name: z.string(), class_name: z.string() })),
  }),
  migrations: z.array(
    z.strictObject({ tag: z.string().min(1), new_sqlite_classes: z.array(z.string()).min(1) }),
  ),
})

export function stagingConfig(template, values) {
  const settings = inputs.safeParse(values)
  if (!settings.success) {
    throw new Error(
      `Set valid values for ${settings.error.issues.map(({ path }) => path.join('.')).join(', ')}.`,
    )
  }
  const config = workerTemplate.safeParse(template)
  if (!config.success) {
    const fields = config.error.issues.flatMap((issue) =>
      issue.code === 'unrecognized_keys' ? issue.keys : [issue.path.join('.') || 'root'],
    )
    throw new Error(`Invalid staging Worker template at ${fields.join(', ')}.`)
  }
  const { bindings } = config.data.durable_objects
  const classes = config.data.migrations.flatMap((migration) => migration.new_sqlite_classes)
  if (
    bindings.length !== Object.keys(allowedObjects).length ||
    !Object.entries(allowedObjects).every(([name, className]) =>
      bindings.some((binding) => binding.name === name && binding.class_name === className),
    ) ||
    classes.length !== bindings.length ||
    !bindings.every(({ class_name }) => classes.includes(class_name))
  ) {
    throw new Error('Verify the PDF, ACCESS_SYNC, and REGISTER SQLite Durable Object bindings.')
  }
  const approved = settings.data
  return {
    ...config.data,
    account_id: approved.INVOICE_STAGING_ACCOUNT_ID,
    routes: [{ pattern: stagingHost, custom_domain: true }],
    vars: {
      BILLING_SOURCE: 'staging',
      ACCESS_TEAM: approved.INVOICE_STAGING_ACCESS_TEAM,
      ACCESS_AUDIENCE: approved.INVOICE_STAGING_ACCESS_AUDIENCE,
      ACCESS_DEVELOPER_EMAIL: approved.INVOICE_STAGING_DEVELOPER_EMAIL,
      ACCESS_POLICY_SYNC_ENABLED: 'false',
      INVOICE_EMAIL_ENABLED: 'false',
      INVOICE_LEGACY_RESEND_ENABLED: 'false',
    },
    d1_databases: [
      {
        binding: 'DB',
        database_name: stagingName,
        database_id: approved.INVOICE_STAGING_D1_ID,
      },
    ],
  }
}

const databaseList = z.array(z.object({ uuid: z.uuid().toLowerCase(), name: z.string() }))

export function verifyStagingDatabase(databaseId, metadata) {
  const databases = databaseList.safeParse(metadata)
  if (!databases.success) throw new Error('Wrangler did not return valid D1 database metadata.')
  const candidates = databases.data.filter(
    ({ uuid, name }) => uuid === databaseId || name === stagingName,
  )
  if (
    candidates.length !== 1 ||
    candidates[0].uuid !== databaseId ||
    candidates[0].name !== stagingName
  ) {
    throw new Error(
      'INVOICE_STAGING_D1_ID must match the rgss-invoice-staging database in Royal Glow.',
    )
  }
}

async function readCloudflareDatabases(configFile) {
  try {
    const wrangler = fileURLToPath(
      new URL('./bin/wrangler.js', import.meta.resolve('wrangler/package.json')),
    )
    const child = Bun.spawn(
      ['node', wrangler, 'd1', 'list', '--json', '--config', fileURLToPath(configFile)],
      {
        cwd: fileURLToPath(new URL('../', import.meta.url)),
        env: {
          ...Bun.env,
          CLOUDFLARE_ACCOUNT_ID: accountId,
          CLOUDFLARE_API_BASE_URL: 'https://api.cloudflare.com/client/v4',
          WRANGLER_SEND_METRICS: 'false',
          CI: 'true',
        },
        signal: AbortSignal.timeout(30_000),
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'ignore',
      },
    )
    const [stdout, status] = await Promise.all([new Response(child.stdout).text(), child.exited])
    if (status === 0) return JSON.parse(stdout)
  } catch {
    // Keep provider command output, including authentication errors, out of the generator logs.
  }
  throw new Error('Could not verify D1 in Royal Glow. Authenticate Wrangler with D1 Read access.')
}

if (import.meta.main) {
  try {
    const source = new URL('../wrangler.jsonc', import.meta.url)
    const config = stagingConfig(Bun.JSONC.parse(await Bun.file(source).text()), Bun.env)
    verifyStagingDatabase(config.d1_databases[0].database_id, await readCloudflareDatabases(source))
    const output = new URL('../wrangler.staging.local.json', import.meta.url)
    await Bun.write(output, `${JSON.stringify(config, null, 2)}\n`)
    console.log('Wrote wrangler.staging.local.json for invoice-staging.theroyalglow.in.')
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
