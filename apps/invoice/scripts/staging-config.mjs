import { fileURLToPath } from 'node:url'
import { z } from 'zod'

const accountId = '6493306f4e280b245bc0b862c64cd9ef'
const stagingName = 'rgss-invoice-staging'
export const stagingHost = 'invoice-staging.theroyalglow.in'
const staging = {
  name: stagingName,
  host: stagingHost,
  bucket: stagingName,
  environment: 'staging',
}
const production = {
  name: 'rgss-invoice-production',
  host: 'invoice.theroyalglow.in',
  bucket: 'rgss-invoices',
  environment: 'production',
}
const allowedObjects = {
  PDF: 'InvoicePdf',
  ACCESS_SYNC: 'InvoiceAccessSync',
  REGISTER: 'InvoiceRegister',
}
const placeholder = '00000000-0000-0000-0000-000000000000'

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

function targetConfig(template, values, target) {
  const key = (name) => `INVOICE_${target.environment.toUpperCase()}_${name}`
  const inputs = z.object({
    [key('ACCOUNT_ID')]: z.literal(accountId),
    [key('D1_ID')]: z
      .uuid()
      .toLowerCase()
      .refine((id) => id !== placeholder),
    [key('ACCESS_TEAM')]: z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/),
    [key('ACCESS_AUDIENCE')]: z.string().regex(/^[a-f0-9]{64}$/),
    [key('DEVELOPER_EMAIL')]: z
      .string()
      .trim()
      .toLowerCase()
      .pipe(z.email().endsWith('@gmail.com')),
  })
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
  const audience = approved[key('ACCESS_AUDIENCE')]
  if (target === production && audience === values.INVOICE_STAGING_ACCESS_AUDIENCE) {
    throw new Error('INVOICE_PRODUCTION_ACCESS_AUDIENCE must differ from the staging audience.')
  }
  return {
    ...config.data,
    name: target.name,
    account_id: approved[key('ACCOUNT_ID')],
    routes: [{ pattern: target.host, custom_domain: true }],
    vars: {
      BILLING_SOURCE: target.environment,
      ACCESS_TEAM: approved[key('ACCESS_TEAM')],
      ACCESS_AUDIENCE: audience,
      ACCESS_DEVELOPER_EMAIL: approved[key('DEVELOPER_EMAIL')],
      ACCESS_POLICY_SYNC_ENABLED: 'false',
      INVOICE_EMAIL_ENABLED: 'false',
      INVOICE_LEGACY_RESEND_ENABLED: 'false',
    },
    d1_databases: [
      {
        binding: 'DB',
        database_name: target.name,
        database_id: approved[key('D1_ID')],
      },
    ],
    r2_buckets: [{ binding: 'FILES', bucket_name: target.bucket }],
  }
}

export function stagingConfig(template, values) {
  return targetConfig(template, values, staging)
}

export function productionConfig(template, values) {
  return targetConfig(template, values, production)
}

const databaseList = z.array(z.object({ uuid: z.uuid().toLowerCase(), name: z.string() }))

function verifyDatabase(databaseId, metadata, target) {
  const databases = databaseList.safeParse(metadata)
  if (!databases.success) throw new Error('Wrangler did not return valid D1 database metadata.')
  const candidates = databases.data.filter(
    ({ uuid, name }) => uuid === databaseId || name === target.name,
  )
  if (
    candidates.length !== 1 ||
    candidates[0].uuid !== databaseId ||
    candidates[0].name !== target.name
  ) {
    throw new Error(
      `INVOICE_${target.environment.toUpperCase()}_D1_ID must match the ${target.name} database in Royal Glow.`,
    )
  }
}

export function verifyStagingDatabase(databaseId, metadata) {
  verifyDatabase(databaseId, metadata, staging)
}

export function verifyProductionDatabase(databaseId, metadata) {
  verifyDatabase(databaseId, metadata, production)
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
    const args = Bun.argv.slice(2)
    const target = args.length === 0 ? staging : production
    if (target === production && (args.length !== 1 || args[0] !== '--production')) {
      throw new Error('Use configure:staging or configure:production.')
    }
    const source = new URL('../wrangler.jsonc', import.meta.url)
    const config = targetConfig(Bun.JSONC.parse(await Bun.file(source).text()), Bun.env, target)
    verifyDatabase(
      config.d1_databases[0].database_id,
      await readCloudflareDatabases(source),
      target,
    )
    const output = `wrangler.${target.environment}.local.json`
    await Bun.write(
      new URL(`../${output}`, import.meta.url),
      `${JSON.stringify(config, null, 2)}\n`,
    )
    console.log(`Wrote ${output} for ${target.host}.`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
