import { expect, test } from 'bun:test'
import { createHmac } from 'node:crypto'
import { runStagingSmoke } from './staging-smoke.mjs'

const origin = 'https://invoice-staging.theroyalglow.in'
const issue = '/internal/v1/invoice-events'
const home = '/portal/home'
const invoiceId = 'rgss-staging-smoke-v1'
const pdf = `/portal/invoices/${invoiceId}/pdf`
const scope = {
  version: 1,
  type: 'invoice.branch-reconciliation',
  source: 'staging',
  branchId: 'rgss-staging-smoke',
  month: '2025-01',
}
const expected = [{ invoiceId, totalPaise: 50000 }]
const env = {
  INVOICE_STAGING_BILLING_EVENT_SECRET: 's'.repeat(32),
  INVOICE_STAGING_BILLING_ACCESS_CLIENT_ID: 'smoke-fixture-client',
  INVOICE_STAGING_BILLING_ACCESS_CLIENT_SECRET: 'smoke-fixture-access-secret',
}

function report(invoices) {
  return Response.json({ ...scope, checkedAt: '2026-11-28T00:00:00Z', invoices })
}

function mockStaging(responses) {
  const requests = []
  return {
    requests,
    fetcher: async (input, init) => {
      const request = new Request(input, init)
      const response = responses[requests.length]
      const record = {
        url: new URL(request.url),
        method: request.method,
        headers: request.headers,
        redirect: request.redirect,
        body: '',
      }
      requests.push(record)
      record.body = await request.text()
      if (!response) throw new Error('Unexpected smoke request')
      return response
    },
  }
}

function expectedSignature(request) {
  const time = request.headers.get('x-rgss-timestamp')
  expect(time).toMatch(/^\d{13}$/)
  return createHmac('sha256', env.INVOICE_STAGING_BILLING_EVENT_SECRET)
    .update(`${time}.${request.body}`)
    .digest('hex')
}

function expectRequestPaths(requests, paths) {
  expect(requests.map(({ url, method }) => [method, url.pathname])).toEqual(paths)
  for (const { url, redirect } of requests) {
    expect(url.origin).toBe(origin)
    expect(redirect).not.toBe('follow')
  }
}

test.each([
  { baseline: [], status: 201 },
  { baseline: expected, status: 204 },
])(
  'rehearses the same isolated fixture safely with initial status $status',
  async ({ baseline, status }) => {
    const { requests, fetcher } = mockStaging([
      new Response(null, {
        status: 302,
        headers: {
          Location:
            'https://theroyalglow.cloudflareaccess.com/cdn-cgi/access/login/invoice-staging.theroyalglow.in',
        },
      }),
      new Response(null, { status: 401 }),
      report(baseline),
      new Response(null, { status: 401 }),
      new Response(null, { status }),
      new Response(null, { status: 204 }),
      report(expected),
    ])
    await runStagingSmoke(env, fetcher)

    expectRequestPaths(requests, [
      ['GET', home],
      ['GET', pdf],
      ['POST', `${issue}/reconcile`],
      ['POST', issue],
      ['POST', issue],
      ['POST', issue],
      ['POST', `${issue}/reconcile`],
    ])
    for (const request of requests.slice(0, 2)) {
      expect(request.headers.has('cf-access-client-id')).toBe(false)
      expect(request.headers.has('cf-access-client-secret')).toBe(false)
    }
    for (const request of requests.slice(2)) {
      expect(request.headers.get('cf-access-client-id')).toBe(
        env.INVOICE_STAGING_BILLING_ACCESS_CLIENT_ID,
      )
      expect(request.headers.get('cf-access-client-secret')).toBe(
        env.INVOICE_STAGING_BILLING_ACCESS_CLIENT_SECRET,
      )
      const signature = request.headers.get('x-rgss-signature')
      if (request === requests[3]) expect(signature).not.toBe(expectedSignature(request))
      else expect(signature).toBe(expectedSignature(request))
    }
    expect(JSON.parse(requests[2].body)).toEqual(scope)
    expect(JSON.parse(requests[6].body)).toEqual(scope)
    expect(requests[3].body).toBe(requests[4].body)
    expect(requests[4].body).toBe(requests[5].body)
    const event = JSON.parse(requests[4].body)
    expect(event).toMatchObject({
      type: 'invoice.issued',
      source: scope.source,
      branchId: scope.branchId,
      invoiceId,
      invoice: { totals: { totalPaise: expected[0].totalPaise } },
    })
    expect(event).not.toHaveProperty('delivery')
    expect(event.invoice.customer.email ?? null).toBeNull()
  },
)

test('stops before any write when the unauthenticated PDF is public', async () => {
  const { requests, fetcher } = mockStaging([
    new Response(null, { status: 403 }),
    new Response('%PDF-1.7', { status: 200 }),
  ])
  await expect(runStagingSmoke(env, fetcher)).rejects.toThrow()
  expectRequestPaths(requests, [
    ['GET', home],
    ['GET', pdf],
  ])
})

test('stops before any write when the login redirect leaves Royal Glow Access', async () => {
  const { requests, fetcher } = mockStaging([
    new Response(null, {
      status: 302,
      headers: { Location: 'https://foreign.example.invalid/cdn-cgi/access/login' },
    }),
  ])
  await expect(runStagingSmoke(env, fetcher)).rejects.toThrow()
  expectRequestPaths(requests, [['GET', home]])
})

test.each([
  { invoices: 'malformed' },
  { invoices: [{ ...expected[0], invoiceId: 'unexpected-invoice' }] },
])('stops before issuance when the reconciliation baseline differs', async ({ invoices }) => {
  const { requests, fetcher } = mockStaging([
    new Response(null, { status: 401 }),
    new Response(null, { status: 403 }),
    report(invoices),
  ])
  await expect(runStagingSmoke(env, fetcher)).rejects.toThrow()
  expectRequestPaths(requests, [
    ['GET', home],
    ['GET', pdf],
    ['POST', `${issue}/reconcile`],
  ])
})
