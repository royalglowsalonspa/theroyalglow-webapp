import { createRequire } from 'node:module'
import { expect, test, vi } from 'vitest'

const { createRetryingFetch } = createRequire(import.meta.url)('./graphql-retry.cjs')
const endpoint = 'https://api.github.com/graphql'
const options = { body: JSON.stringify({ query: 'query history { repository { name } }' }) }
const unavailable = () =>
  Response.json({
    errors: [{ message: 'Something went wrong while executing your query on date' }],
  })

test('retries a transient read failure and preserves the successful response', async () => {
  const expected = Response.json({ data: { ok: true } })
  const fetch = vi.fn().mockResolvedValueOnce(unavailable()).mockResolvedValueOnce(expected)
  const sleep = vi.fn()
  expect(await createRetryingFetch(fetch, sleep)(endpoint, options)).toBe(expected)
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(sleep).toHaveBeenCalledWith(1000)
})

test('stops after three retries and exposes the original failure', async () => {
  const failure = unavailable()
  const fetch = vi.fn().mockResolvedValue(failure)
  expect(await createRetryingFetch(fetch, vi.fn())(endpoint, options)).toBe(failure)
  expect(fetch).toHaveBeenCalledTimes(4)
})

test('never retries mutations, other hosts, invalid bodies, or authorization errors', async () => {
  for (const [url, init, response] of [
    [endpoint, { body: JSON.stringify({ query: 'mutation create { value }' }) }, unavailable()],
    ['https://example.com/graphql', options, unavailable()],
    [endpoint, { body: 'not json' }, unavailable()],
    [endpoint, options, Response.json({ errors: [{ message: 'Resource not accessible' }] })],
    [endpoint, options, new Response('Forbidden', { status: 403 })],
  ]) {
    const fetch = vi.fn().mockResolvedValue(response)
    expect(await createRetryingFetch(fetch, vi.fn())(url, init)).toBe(response)
    expect(fetch).toHaveBeenCalledTimes(1)
  }
})

test('retries a gateway outage only for read queries', async () => {
  const success = Response.json({ data: {} })
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response('', { status: 502 }))
    .mockResolvedValueOnce(success)
  expect(await createRetryingFetch(fetch, vi.fn())(endpoint, options)).toBe(success)
  expect(fetch).toHaveBeenCalledTimes(2)
})
