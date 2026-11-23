import { realpath } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { isAbsolute, relative } from 'node:path'
import { env } from 'node:process'

const connection = URL.parse(env.DATABASE_URL ?? '')
const dataDirectory = env.REHEARSAL_PG_DATA
const port = Number(connection?.port)
if (
  connection?.protocol !== 'postgresql:' ||
  !['127.0.0.1', 'localhost'].includes(connection.hostname) ||
  !Number.isInteger(port) ||
  port < 1024 ||
  port > 65535 ||
  !/^\/rgss_rehearsal_[a-z0-9_]+$/.test(connection.pathname) ||
  !connection.username ||
  !connection.password ||
  connection.search ||
  !dataDirectory ||
  !isAbsolute(dataDirectory)
) {
  throw new Error('Use a disposable native PostgreSQL rehearsal database on loopback')
}

// Reuse the native PostgreSQL driver already installed by the CMS workspace.
const cms = createRequire(new URL('../../apps/cms/package.json', import.meta.url))
const loadPg = createRequire(cms.resolve('@payloadcms/db-postgres'))
const { Pool } = loadPg('pg')
const pool = new Pool({
  host: '127.0.0.1',
  port,
  database: connection.pathname.slice(1),
  user: decodeURIComponent(connection.username),
  password: decodeURIComponent(connection.password),
  ssl: false,
  options: '-c TimeZone=UTC',
  client_encoding: 'UTF8',
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 5_000,
  allowExitOnIdle: true,
})
try {
  const {
    rows: [identity],
  } = await pool.query(`select current_database() as name, inet_server_port() as port,
    host(inet_server_addr()) as host, current_setting('data_directory') as data`)
  if (
    identity.name !== connection.pathname.slice(1) ||
    identity.host !== '127.0.0.1' ||
    identity.port !== port ||
    relative(await realpath(dataDirectory), await realpath(identity.data)) !== ''
  ) {
    throw new Error('The loopback target does not match the rehearsal PostgreSQL process')
  }
} catch (error) {
  await pool.end()
  throw error
}

const fetchLoopback = globalThis.fetch
const neonEndpoint =
  connection.hostname === 'localhost' ? 'https://localhost/sql' : 'https://api.0.0.1/sql'
globalThis.fetch = async (input, init) => {
  const inputUrl = input instanceof Request ? input.url : String(input)
  // The Neon client replaces the first segment of the database hostname when
  // deriving an API hostname. This synthetic IPv4 URL is intercepted in-process.
  if (inputUrl !== neonEndpoint) {
    const url = new URL(inputUrl)
    if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
      throw new Error('The local rehearsal disables outbound fetch requests')
    }
    const redirect = init?.redirect ?? (input instanceof Request ? input.redirect : undefined)
    return fetchLoopback(input, { ...init, redirect: redirect === 'manual' ? 'manual' : 'error' })
  }

  const headers = new Headers(init?.headers)
  const target = URL.parse(headers.get('Neon-Connection-String') ?? '')
  if (
    init?.method !== 'POST' ||
    target?.protocol !== connection.protocol ||
    target.host !== connection.host ||
    target.pathname !== connection.pathname ||
    target.username !== connection.username ||
    target.password !== connection.password
  ) {
    return Response.json({ message: 'Unexpected local rehearsal connection' }, { status: 400 })
  }
  if (
    headers.has('Neon-Batch-Isolation-Level') ||
    headers.has('Neon-Batch-Read-Only') ||
    headers.has('Neon-Batch-Deferrable')
  ) {
    return Response.json({ message: 'Custom transaction modes require Neon' }, { status: 400 })
  }

  const body = JSON.parse(init.body)
  const client = await pool.connect()
  const isBatch = Array.isArray(body.queries)
  const run = (query) =>
    client.query({
      text: query.query,
      values: query.params,
      rowMode: 'array',
      types: { getTypeParser: () => String },
    })
  try {
    if (!isBatch) return Response.json(await run(body))
    await client.query('BEGIN')
    const results = []
    for (const query of body.queries) results.push(await run(query))
    await client.query('COMMIT')
    return Response.json({ results })
  } catch (error) {
    if (isBatch) await client.query('ROLLBACK')
    return Response.json({ ...error, message: error.message }, { status: 400 })
  } finally {
    client.release()
  }
}
