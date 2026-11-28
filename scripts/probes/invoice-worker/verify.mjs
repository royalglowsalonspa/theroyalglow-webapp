import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'

const port = process.env.INVOICE_PROBE_PORT ?? '8787'
const base = new URL(process.env.INVOICE_PROBE_URL ?? `http://127.0.0.1:${port}`)
assert.ok(
  base.protocol === 'https:' || (base.protocol === 'http:' && base.hostname === '127.0.0.1'),
  'The probe URL must use HTTPS or local loopback',
)
assert.ok(!base.username && !base.password, 'The probe URL must not contain credentials')
const token = process.env.INVOICE_PROBE_TOKEN
assert.ok(token && token.length >= 32, 'Set INVOICE_PROBE_TOKEN before running verification')
const headers = { authorization: `Bearer ${token}` }

async function request(path, options) {
  return fetch(new URL(path, base), {
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
    ...options,
  })
}

async function fetchPdf(sample) {
  const started = performance.now()
  const response = await request(`/fixtures/${sample}`, { headers })
  assert.equal(response.status, 200, `${sample} PDF returned HTTP ${response.status}`)
  assert.equal(response.headers.get('content-type'), 'application/pdf')
  assert.equal(response.headers.get('cache-control'), 'no-store')
  const pdf = Buffer.from(await response.arrayBuffer())
  assert.equal(pdf.subarray(0, 5).toString('ascii'), '%PDF-')
  return { pdf, elapsed: Math.round(performance.now() - started) }
}

assert.equal((await request('/fixtures/normal')).status, 401)
const incorrectHeaders = {
  authorization: `Bearer ${token.replace(/^./, token[0] === '0' ? '1' : '0')}`,
}
assert.equal((await request('/fixtures/normal', { headers: incorrectHeaders })).status, 401)
assert.equal((await request('/fixtures/unknown', { headers })).status, 404)
assert.equal((await request('/fixtures/normal', { headers, method: 'POST' })).status, 405)

const output = new URL('./dist/', import.meta.url)
await mkdir(output, { recursive: true })

for (const sample of ['normal', 'large']) {
  const { pdf, elapsed } = await fetchPdf(sample)
  await writeFile(new URL(`${sample}.pdf`, output), pdf)
  console.log(`${sample}: ${pdf.length} bytes, ${elapsed} ms round trip`)
}

const burst = await Promise.all(
  Array.from({ length: 10 }, (_, index) => fetchPdf(index % 2 === 0 ? 'normal' : 'large')),
)
console.log(
  `10 concurrent requests passed; slowest ${Math.max(...burst.map(({ elapsed }) => elapsed))} ms`,
)
