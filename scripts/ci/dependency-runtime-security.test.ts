import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Resolve through the deployed CMS consumers, rather than testing an unrelated
// hoisted copy. Node children also expose uncaught asynchronous dependency errors.
const cmsConsumer = `
import assert from 'node:assert/strict'
import { realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
const cms = createRequire(resolve('apps/cms/package.json'))
`

const lexicalProbe = `${cmsConsumer}
const richtext = createRequire(realpathSync(cms.resolve('@payloadcms/richtext-lexical')))
const headless = createRequire(realpathSync(richtext.resolve('@lexical/headless/dom')))
const { withDOM } = headless('@lexical/headless/dom')
const { Window } = headless('happy-dom')
const { createHeadlessEditor } = richtext('@lexical/headless')
const { $getRoot } = richtext('lexical')
const { $generateNodesFromDOM, $generateHtmlFromNodes } = richtext('@lexical/html')

const roundTrip = withDOM((window) => {
  const editor = createHeadlessEditor({
    namespace: 'dependency-security-regression',
    onError(error) { throw error },
  })
  editor.update(() => {
    const document = new window.DOMParser().parseFromString(
      '<p>Royal Glow <strong>salon</strong> &amp; spa</p>', 'text/html',
    )
    $getRoot().append(...$generateNodesFromDOM(editor, document))
  }, { discrete: true })
  return editor.getEditorState().read(() => {
    const document = new window.DOMParser().parseFromString(
      $generateHtmlFromNodes(editor), 'text/html',
    )
    return {
      text: document.body.textContent,
      bold: document.querySelector('strong, b')?.textContent,
    }
  })
})
assert.deepEqual(roundTrip, { text: 'Royal Glow salon & spa', bold: 'salon' })

// GHSA-834v-8h66-3h79: invalid import aliases must not become executable default
// initializers. The JSON dependency is a data URL; the only payload is a marker
// inside this disposable window. No host APIs, files, or network are involved.
const window = new Window({
  settings: {
    enableJavaScriptEvaluation: true,
    suppressInsecureJavaScriptEnvironmentWarning: true,
  },
})
try {
  const script = window.document.createElement('script')
  script.type = 'module'
  script.textContent = [
    'import { missing as injected = globalThis.__aliasExecuted = true }',
    'from "data:application/json,%7B%7D" with { type: "json" };',
    'globalThis.__moduleCompleted = true;',
  ].join(' ')
  window.document.body.appendChild(script)
  await window.happyDOM.waitUntilComplete()
  assert.equal(window.__moduleCompleted, true, 'Module fixture must actually execute')
  assert.equal(window.__aliasExecuted, undefined, 'Invalid alias initializer must not run')
  process.stdout.write(JSON.stringify({ roundTrip, aliasExecuted: false }))
} finally {
  await window.happyDOM.close()
}
`

const undiciProbe = `${cmsConsumer}
import http from 'node:http'
import { setTimeout as delay } from 'node:timers/promises'
const payload = createRequire(realpathSync(cms.resolve('payload')))
const { Agent, fetch } = payload('undici')
const dispatcher = new Agent({ connections: 1 })
let malformedRequests = 0
const server = http.createServer((request, response) => {
  if (request.url === '/malformed') {
    malformedRequests++
    response.writeHead(200, {
      'Content-Encoding': Array(6).fill('gzip').join(', '),
      'Content-Length': '1',
      Connection: 'close',
    })
    response.flushHeaders()
    response.socket.end()
    return
  }
  response.end('alive')
})
await new Promise((resolve, reject) => {
  server.once('error', reject)
  server.listen(0, '127.0.0.1', resolve)
})
const address = server.address()
assert.ok(address && typeof address === 'object')
const origin = 'http://127.0.0.1:' + address.port
try {
  // GHSA-xjj6-f33q-929c: the fetch rejection was caught even in vulnerable
  // versions, but early close emitted an unhandled error on an orphaned stream.
  await assert.rejects(
    fetch(origin + '/malformed', { dispatcher, signal: AbortSignal.timeout(2000) }),
    (error) => /too many content-encodings/.test(error.cause?.message ?? ''),
  )
  assert.equal(malformedRequests, 1)
  await delay(250)
  const followup = await fetch(origin + '/healthy', {
    dispatcher, signal: AbortSignal.timeout(2000),
  })
  assert.equal(followup.status, 200)
  assert.equal(await followup.text(), 'alive')
  process.stdout.write(JSON.stringify({ malformedRejected: true, followup: 'alive' }))
} finally {
  await dispatcher.close()
  server.closeAllConnections()
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
}
`

function runProbe(source: string): unknown {
  return JSON.parse(
    execFileSync(process.execPath, ['--input-type=module', '--eval', source], {
      cwd: resolve(import.meta.dirname, '../..'),
      encoding: 'utf8',
      timeout: 10_000,
    }),
  )
}

describe('installed CMS transitive dependency runtimes', () => {
  it('preserves Lexical HTML conversion and blocks Happy DOM import alias injection', () => {
    expect(runProbe(lexicalProbe)).toEqual({
      roundTrip: { text: 'Royal Glow salon & spa', bold: 'salon' },
      aliasExecuted: false,
    })
  }, 15_000)

  it('rejects excessive encodings without crashing and serves a subsequent fetch', () => {
    expect(runProbe(undiciProbe)).toEqual({ malformedRejected: true, followup: 'alive' })
  }, 15_000)
})
