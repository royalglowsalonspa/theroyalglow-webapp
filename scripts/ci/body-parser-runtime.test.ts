import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Run outside Vitest's loader and process: the vulnerable decoder throws an
// uncaught exception after responding, so a successful first response is not
// sufficient. Resolve Express and its parser from the installed MCP consumer.
const runtimeProbe = `
import assert from 'node:assert/strict'
import { realpathSync } from 'node:fs'
import http from 'node:http'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { gzipSync } from 'node:zlib'

const root = createRequire(resolve('package.json'))
const sdk = createRequire(realpathSync(root.resolve('@modelcontextprotocol/sdk/server/streamableHttp.js')))
const expressPath = realpathSync(sdk.resolve('express'))
const express = sdk('express')
const expressConsumer = createRequire(expressPath)
const bodyParser = expressConsumer('body-parser')
assert.equal(express.json, bodyParser.json, 'Express must use the resolved consumer parser')

const app = express()
app.use(express.json())
app.post('/', (req, res) => res.json(req.body))
const server = http.createServer(app)
await new Promise((resolve, reject) => {
  server.once('error', reject)
  server.listen(0, '127.0.0.1', resolve)
})
const address = server.address()
assert.ok(address && typeof address === 'object')

function post(body, encoding) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: '127.0.0.1',
      port: address.port,
      method: 'POST',
      path: '/',
      agent: false,
      headers: {
        'Content-Type': 'application/json',
        ...(encoding ? { 'Content-Encoding': encoding } : {}),
        'Content-Length': body.length,
      },
    }, (response) => {
      let data = ''
      response.setEncoding('utf8')
      response.on('data', (chunk) => { data += chunk })
      response.once('error', reject)
      response.once('end', () => resolve({ status: response.statusCode, body: data }))
    })
    request.once('error', reject)
    request.setTimeout(2000, () => request.destroy(new Error('Local parser request timed out')))
    request.end(body)
  })
}

try {
  // Upstream GHSA-27r3-jxmh-p828 regression: a valid gzip frame followed by a
  // zero byte and a large invalid trailer. Modern Node returns the parsed body
  // before zlib encounters the trailer; the vulnerable process then crashes.
  const body = Buffer.concat([
    gzipSync('{"a":1}'),
    Buffer.from([0]),
    Buffer.alloc(100 * 1024, 0x58),
  ])
  const compressed = await post(body, 'gzip')
  assert.deepEqual(compressed, { status: 200, body: '{"a":1}' })
  await delay(250)
  const followup = await post(Buffer.from('{"alive":true}'))
  assert.deepEqual(followup, { status: 200, body: '{"alive":true}' })
  process.stdout.write(JSON.stringify({ compressed, followup }))
} finally {
  server.closeAllConnections()
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
}
`

describe('installed MCP Express body-parser runtime', () => {
  it('survives trailing bytes after compressed JSON and serves a subsequent request', () => {
    const output = execFileSync(process.execPath, ['--input-type=module', '--eval', runtimeProbe], {
      cwd: resolve(import.meta.dirname, '../..'),
      encoding: 'utf8',
      timeout: 10_000,
    })
    expect(JSON.parse(output)).toEqual({
      compressed: { status: 200, body: '{"a":1}' },
      followup: { status: 200, body: '{"alive":true}' },
    })
  }, 15_000)
})
