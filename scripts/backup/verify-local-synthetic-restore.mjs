#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, realpath } from 'node:fs/promises'
import { basename, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'

const SHA256 = /^[a-f0-9]{64}$/
const GIT_SHA = /^[a-f0-9]{40}$/
const DATABASE_NAME = /^rgss_rehearsal_restore_[a-z0-9_]{1,35}$/
const SYNTHETIC_SOURCES = new Set(['local-ci-fixture', 'local-synthetic-fixture'])
const CONTENT_LIMIT = 16 * 1024 * 1024

function parseBackupFacts(text) {
  return JSON.parse(text, (_key, value) => {
    // Counts and balances are strings. Reject a ledger number that would lose
    // precision and could make two different sets of facts appear equal.
    if (typeof value === 'number' && !Number.isSafeInteger(value)) {
      throw new Error('Synthetic backup facts contain a number outside the safe integer range.')
    }
    return value
  })
}

async function sha256File(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

function runPg(bin, env, executable, args, input) {
  return new Promise((resolve, reject) => {
    const command = join(bin, process.platform === 'win32' ? `${executable}.exe` : executable)
    const child = spawn(command, args, { env, stdio: ['pipe', 'pipe', 'ignore'] })
    const chunks = []
    let length = 0
    child.stdout.on('data', (chunk) => {
      length += chunk.length
      if (length > CONTENT_LIMIT) child.kill()
      else chunks.push(chunk)
    })
    child.on('error', () => reject(new Error(`Could not start ${executable}.`)))
    child.on('close', (code) => {
      if (code === 0 && length <= CONTENT_LIMIT) resolve(Buffer.concat(chunks).toString('utf8'))
      else reject(new Error(`${executable} failed. Fixture diagnostics were withheld.`))
    })
    child.stdin.on('error', () => child.kill())
    child.stdin.end(input)
  })
}

async function verify(environment = process.env) {
  const [manifestPath, dumpPath, database, portText] = process.argv.slice(2)
  const port = Number(portText)
  if (
    process.argv.length !== 6 ||
    !DATABASE_NAME.test(database) ||
    !/^\d{1,5}$/.test(portText) ||
    port < 1024 ||
    port > 65535
  ) {
    throw new Error(
      'Usage: verify-local-synthetic-restore.mjs <manifest> <dump> <rgss_rehearsal_restore_name> <port>',
    )
  }

  const binPath = environment.REHEARSAL_POSTGRES_BIN
  const directoryPath = environment.REHEARSAL_PG_DATA
  if (!binPath || !directoryPath) {
    throw new Error(
      'Set REHEARSAL_POSTGRES_BIN and REHEARSAL_PG_DATA for the disposable native cluster.',
    )
  }
  const bin = await realpath(binPath)
  const expectedDirectory = await realpath(directoryPath)
  const manifest = parseBackupFacts(await readFile(manifestPath, 'utf8'))
  const { facts } = manifest
  if (
    manifest.version !== 1 ||
    manifest.key !== `weekly/${basename(dumpPath)}` ||
    !SYNTHETIC_SOURCES.has(manifest.sourceId) ||
    !SHA256.test(manifest.dumpSha256) ||
    !SHA256.test(manifest.schemaSha256) ||
    !GIT_SHA.test(manifest.sourceCommit) ||
    !Number.isInteger(facts?.postgresMajor) ||
    !Array.isArray(facts.drizzleLedger) ||
    !facts.counts ||
    Object.keys(facts.counts).length === 0
  ) {
    throw new Error('Expected a named full backup manifest from a local synthetic fixture.')
  }
  if ((await sha256File(dumpPath)) !== manifest.dumpSha256) {
    throw new Error('Dump checksum differs from the specified synthetic manifest.')
  }

  const env = {
    ...Object.fromEntries(Object.entries(environment).filter(([key]) => !/^PG/i.test(key))),
    PGHOSTADDR: '127.0.0.1',
    PGHOST: '127.0.0.1',
    PGPORT: portText,
    PGDATABASE: database,
    PGUSER: environment.REHEARSAL_PG_USER ?? 'postgres',
    PGPASSWORD: environment.REHEARSAL_PG_PASSWORD ?? '',
    PGCONNECT_TIMEOUT: '5',
    PGSSLMODE: 'disable',
    PGCLIENTENCODING: 'UTF8',
  }
  const run = (name, args, input) => runPg(bin, env, name, args, input)
  const psql = (sql) => run('psql', ['-X', '-qAt', '-w', '-v', 'ON_ERROR_STOP=1'], sql)
  const target = JSON.parse(
    await psql(`
    SELECT jsonb_build_object(
      'database', current_database(),
      'directory', current_setting('data_directory'),
      'major', current_setting('server_version_num')::int / 10000,
      'address', host(inet_server_addr()),
      'port', inet_server_port(),
      'empty', NOT EXISTS (
        SELECT FROM pg_catalog.pg_namespace
        WHERE nspname NOT IN ('public', 'information_schema', 'pg_catalog', 'pg_toast')
      ) AND NOT EXISTS (
        SELECT FROM pg_catalog.pg_depend AS d
        JOIN pg_catalog.pg_namespace AS n ON n.oid = d.refobjid
        WHERE d.refclassid = 'pg_catalog.pg_namespace'::regclass AND n.nspname = 'public'
      ) AND (SELECT array_agg(extname ORDER BY extname) FROM pg_catalog.pg_extension) = ARRAY['plpgsql']::name[]
    );
  `),
  )
  if (
    target.database !== database ||
    target.address !== '127.0.0.1' ||
    target.port !== port ||
    target.major !== facts.postgresMajor ||
    relative(expectedDirectory, await realpath(target.directory)) !== '' ||
    target.empty !== true
  ) {
    throw new Error(
      'Restore requires the matching empty database and PostgreSQL version in the named local cluster.',
    )
  }

  await run('pg_restore', [
    '--no-password',
    '--dbname',
    database,
    '--no-owner',
    '--no-acl',
    '--exit-on-error',
    '--single-transaction',
    resolve(dumpPath),
  ])
  const factSql = await readFile(new URL('./database-facts.sql', import.meta.url), 'utf8')
  const actualFacts = parseBackupFacts(
    await psql(
      `BEGIN READ ONLY;\nSET LOCAL search_path = pg_catalog;\nSET LOCAL TIME ZONE 'UTC';\n${factSql}\nCOMMIT;\n`,
    ),
  )
  const { database: _sourceDatabase, ...expected } = facts
  const { database: _restoredDatabase, ...actual } = actualFacts
  if (!isDeepStrictEqual(actual, expected)) {
    throw new Error('Restored facts differ from the synthetic manifest.')
  }
  const schema = await run('pg_dump', ['-w', '--schema-only', '--no-owner', '--no-acl'])
  // Match normalize-schema.sh for the SQL emitted by pg_dump.
  const normalized = schema
    .replace(/\r\n/g, '\n')
    .replace(/^(?:\\(?:un)?restrict[^\S\r\n].*|-- Dumped (?:from|by) .*)\n/gm, '')
  if (createHash('sha256').update(normalized).digest('hex') !== manifest.schemaSha256) {
    throw new Error('Restored schema differs from the synthetic manifest.')
  }
  console.log(`Local synthetic restore verified in ${database}. Retained for migration rehearsal.`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await verify()
  } catch (error) {
    if (error instanceof SyntaxError || error?.code) {
      console.error('Could not read local synthetic restore inputs.')
    } else {
      console.error(error.message)
    }
    process.exitCode = 1
  }
}
