// @vitest-environment node

import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const { readInvoiceStaffRoster } = vi.hoisted(() => ({ readInvoiceStaffRoster: vi.fn() }))
vi.mock('@rgss/db/queries', () => ({ readInvoiceStaffRoster }))

import { POST } from './route'

const url = 'https://invoice-staging.example.test/internal/v1/staff-roster'
const secret = 'fixture-roster-secret-32-characters'
const transport = vi.fn<typeof fetch>()

const request = (authorized = true) =>
  new Request('https://admin-staging.example.test/api/jobs/invoice-staff-roster', {
    method: 'POST',
    body: '{}',
    headers: authorized ? { 'x-internal-job-token': 'fixture-job-token' } : {},
  })

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', undefined)
  vi.stubEnv('QSTASH_NEXT_SIGNING_KEY', undefined)
  vi.stubEnv('INTERNAL_JOB_TOKEN', 'fixture-job-token')
  vi.stubEnv('INVOICE_ROSTER_URL', url)
  vi.stubEnv('INVOICE_ROSTER_SOURCE', 'staging')
  vi.stubEnv('INVOICE_ROSTER_SECRET', secret)
  vi.stubEnv('INVOICE_ROSTER_ACCESS_CLIENT_ID', 'fixture-client-id')
  vi.stubEnv('INVOICE_ROSTER_ACCESS_CLIENT_SECRET', 'fixture-client-secret')
  readInvoiceStaffRoster.mockReset().mockResolvedValue({
    revision: 1795747200000000,
    rows: [
      { branchId: 'br_z', ownerEmail: 'Unusable@example.test', managerEmail: null },
      { branchId: 'br_a', ownerEmail: 'Owner@GMAIL.com', managerEmail: 'Manager@gmail.com' },
    ],
  })
  transport.mockReset().mockResolvedValue(new Response(null, { status: 201 }))
  vi.stubGlobal('fetch', transport)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

it('rejects requests without job authentication before requesting a roster', async () => {
  expect((await POST(request(false))).status).toBe(401)
  expect(readInvoiceStaffRoster).not.toHaveBeenCalled()
  expect(transport).not.toHaveBeenCalled()
})

it('does no work until a roster endpoint is configured', async () => {
  vi.stubEnv('INVOICE_ROSTER_URL', undefined)
  expect(await (await POST(request())).json()).toEqual({ success: true, skipped: true })
  expect(readInvoiceStaffRoster).not.toHaveBeenCalled()
  expect(transport).not.toHaveBeenCalled()
})

it.each([
  { key: 'INVOICE_ROSTER_ACCESS_CLIENT_SECRET', value: '' },
  {
    key: 'INVOICE_ROSTER_URL',
    value: 'http://invoice-staging.example.test/internal/v1/staff-roster',
  },
  { key: 'INVOICE_ROSTER_URL', value: 'https://invoice-staging.example.test/other-path' },
])(
  'rejects unsafe or incomplete configuration before obtaining branch data',
  async ({ key, value }) => {
    vi.stubEnv(key, value)
    expect((await POST(request())).status).toBe(503)
    expect(readInvoiceStaffRoster).not.toHaveBeenCalled()
    expect(transport).not.toHaveBeenCalled()
  },
)

it('sends an exact signed snapshot containing only the expected portal fields', async () => {
  const response = await POST(request())
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ success: true, branches: 2, assignments: 2 })
  expect(transport).toHaveBeenCalledOnce()
  const [endpoint, options] = transport.mock.calls[0] ?? []
  expect(String(endpoint)).toBe(url)
  expect(options?.method).toBe('POST')
  expect(options?.redirect).toBe('error')
  expect(JSON.parse(String(options?.body))).toEqual({
    version: 1,
    type: 'staff.roster',
    source: 'staging',
    revision: 1795747200000000,
    branches: ['br_a', 'br_z'],
    assignments: [
      { branchId: 'br_a', email: 'manager@gmail.com', role: 'manager' },
      { branchId: 'br_a', email: 'owner@gmail.com', role: 'owner' },
    ],
  })
  const headers = new Headers(options?.headers)
  expect(headers.get('cf-access-client-id')).toBe('fixture-client-id')
  expect(headers.get('cf-access-client-secret')).toBe('fixture-client-secret')
  expect(headers.get('x-rgss-timestamp')).toMatch(/^\d{13}$/)
  const signature = createHmac('sha256', secret)
    .update(`${headers.get('x-rgss-timestamp')}.${options?.body}`)
    .digest('hex')
  expect(headers.get('x-rgss-signature')).toBe(signature)
})

it('accepts superseded or replayed snapshots acknowledged by the Worker', async () => {
  transport.mockResolvedValueOnce(new Response(null, { status: 204 }))
  expect((await POST(request())).status).toBe(200)
})

it.each([200, 302, 409, 429, 503])(
  'returns a retryable job failure on Worker status %d',
  async (status) => {
    transport.mockResolvedValueOnce(new Response('contains private data', { status }))
    const response = await POST(request())
    expect(response.status).toBe(502)
    expect(await response.text()).toBe('Invoice roster delivery failed')
  },
)

it('does not send an invalid or truncated roster', async () => {
  readInvoiceStaffRoster.mockResolvedValueOnce({
    revision: 1,
    rows: Array.from({ length: 201 }, (_, index) => ({
      branchId: `br_${index}`,
      ownerEmail: null,
      managerEmail: null,
    })),
  })
  expect((await POST(request())).status).toBe(500)
  expect(transport).not.toHaveBeenCalled()
})
