import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { InvoiceRecoveryPanel } from './invoice-recovery-panel'

const branch = { id: 'branch-east', name: 'East branch' }
const month = '2025-08'
const endpoint = '/api/invoice-reconciliation'
const restored = {
  invoiceId: 'invoice-published',
  invoiceNumber: 'RG/2526/000001',
  totalPaise: 50000,
  publication: 'published',
  periodBasis: 'saved_issue_time',
  pinnedEvent: true,
  legacyPdfReference: false,
  nextAction: 'verify_published_event',
}
const archived = {
  ...restored,
  invoiceId: 'invoice-legacy',
  invoiceNumber: 'RG/2526/000002',
  publication: 'uncaptured',
  periodBasis: 'creation_time_fallback',
  pinnedEvent: false,
  legacyPdfReference: true,
  nextAction: 'verify_original_pdf',
}
const pending = {
  ...restored,
  invoiceId: 'invoice-pending',
  invoiceNumber: 'RG/2526/000003',
  publication: 'pending',
  nextAction: 'review_outbox',
}
const failed = {
  ...pending,
  invoiceId: 'invoice-failed',
  invoiceNumber: 'RG/2526/000004',
  publication: 'failed',
}
const invoices = [restored, archived, pending, failed]

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it.each([
  {
    invoice: restored,
    review: 'Review restore',
    submit: 'Restore invoice',
    report: 'recover_invoice',
    status: 'restored',
  },
  {
    invoice: archived,
    review: 'Review original',
    submit: 'Archive original PDF',
    report: 'archive_original',
    status: 'archived',
  },
])('requires explicit confirmation and a reason to $submit', async (action) => {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/branches')
      return Response.json({ success: true, data: { branches: [branch] } })
    if (url === endpoint && init?.method === 'POST') {
      return Response.json({
        success: true,
        data: { branchId: branch.id, invoiceId: action.invoice.invoiceId, status: action.status },
      })
    }
    if (url.startsWith(`${endpoint}?`)) {
      return Response.json({
        success: true,
        data: {
          branchId: branch.id,
          month,
          checkedAt: '2025-09-01T08:00:00Z',
          invoiceCount: invoices.length,
          invoices,
        },
      })
    }
    throw new Error(`Unexpected request: ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  const sends = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')
  render(<InvoiceRecoveryPanel />)

  await screen.findByRole('option', { name: branch.name })
  expect(fetchMock.mock.calls.map(([path]) => path)).toEqual(['/api/branches'])
  fireEvent.change(screen.getByLabelText('Branch'), { target: { value: branch.id } })
  fireEvent.change(screen.getByLabelText('Invoice month (IST)'), { target: { value: month } })
  fireEvent.click(screen.getByRole('button', { name: 'Load inventory' }))
  const review = await screen.findByRole('button', {
    name: `${action.review} for ${action.invoice.invoiceNumber}`,
  })
  const inventoryRequest = fetchMock.mock.calls.find(([url]) => url.startsWith(`${endpoint}?`))
  if (!inventoryRequest) throw new Error('The selected inventory was not requested')
  const [url, init] = inventoryRequest
  expect(init?.method ?? 'GET').toBe('GET')
  expect(Object.fromEntries(new URL(url, 'https://admin.example.invalid').searchParams)).toEqual({
    report: 'backfill_inventory',
    month,
    branchId: branch.id,
  })
  expect(screen.getByText(pending.invoiceNumber)).toBeVisible()
  expect(screen.getByText(failed.invoiceNumber)).toBeVisible()
  expect(screen.queryByRole('button', { name: /Review.*RG\/2526\/00000[34]/ })).toBeNull()
  expect(sends()).toEqual([])

  fireEvent.click(review)
  expect(sends()).toEqual([])
  const confirm = screen.getByRole('button', { name: action.submit })
  fireEvent.click(confirm)
  expect(sends()).toEqual([])

  const reason = 'Verified saved invoice records'
  fireEvent.change(screen.getByLabelText('Reason'), { target: { value: reason } })
  fireEvent.click(confirm)
  expect(await screen.findByText(new RegExp(action.status, 'i'))).toBeVisible()
  expect(sends()).toHaveLength(1)
  expect(sends()[0]?.[0]).toBe(endpoint)
  expect(JSON.parse(String(sends()[0]?.[1]?.body))).toEqual({
    report: action.report,
    branchId: branch.id,
    invoiceId: action.invoice.invoiceId,
    reason,
  })
})

it('keeps the inventory available and reports individual differences even when totals match', async () => {
  const inventoryUrl = `${endpoint}?report=backfill_inventory&month=${month}&branchId=${branch.id}`
  const compareUrl = `${endpoint}?month=${month}&branchId=${branch.id}`
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method && init.method !== 'GET') throw new Error('Expected a read-only request')
    if (url === '/api/branches')
      return Response.json({ success: true, data: { branches: [branch] } })
    if (url === inventoryUrl)
      return Response.json({
        success: true,
        data: { branchId: branch.id, month, invoiceCount: 1, invoices: [restored] },
      })
    if (url === compareUrl) {
      if (fetchMock.mock.calls.filter(([path]) => path === compareUrl).length === 1)
        return Response.json(
          { error: { message: 'The invoice portal connection is unavailable.' } },
          { status: 503 },
        )
      return Response.json({
        success: true,
        data: {
          branchId: branch.id,
          month,
          checkedAt: '2025-09-01T08:00:00Z',
          status: 'different',
          neonCount: 1,
          portalCount: 1,
          exceptions: [
            {
              invoiceId: restored.invoiceId,
              reason: 'missing_from_portal',
              neonPaise: restored.totalPaise,
              portalPaise: null,
              publication: 'published',
            },
            {
              invoiceId: 'invoice-only-in-portal',
              reason: 'missing_from_neon',
              neonPaise: null,
              portalPaise: restored.totalPaise,
              publication: null,
            },
          ],
        },
      })
    }
    throw new Error(`Unexpected request: ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  render(<InvoiceRecoveryPanel />)

  await screen.findByRole('option', { name: branch.name })
  fireEvent.change(screen.getByLabelText('Branch'), { target: { value: branch.id } })
  fireEvent.change(screen.getByLabelText('Invoice month (IST)'), { target: { value: month } })
  fireEvent.click(screen.getByRole('button', { name: 'Load inventory' }))
  const compare = await screen.findByRole('button', { name: 'Compare with portal' })
  expect(fetchMock.mock.calls.map(([path]) => path)).toEqual(['/api/branches', inventoryUrl])

  fireEvent.click(compare)
  expect(await screen.findByText('The invoice portal connection is unavailable.')).toBeVisible()
  expect(screen.getByText(restored.invoiceNumber)).toBeVisible()
  fireEvent.click(compare)

  expect(await screen.findByText('Invoice differences found')).toBeVisible()
  expect(screen.getByRole('table', { name: `Invoice differences for ${month}` })).toBeVisible()
  expect(screen.getByText('Missing from portal')).toBeVisible()
  expect(screen.getByText('Missing from billing')).toBeVisible()
  const portalOnly = within(screen.getByRole('row', { name: /invoice-only-in-portal/ }))
  expect(portalOnly.getByRole('cell', { name: 'Unavailable' })).toBeVisible()
  expect(portalOnly.getByRole('cell', { name: '₹500.00' })).toBeVisible()
  expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
    '/api/branches',
    inventoryUrl,
    compareUrl,
    compareUrl,
  ])

  fireEvent.change(screen.getByLabelText('Invoice month (IST)'), { target: { value: '2025-07' } })
  expect(screen.queryByText('Invoice differences found')).toBeNull()
})
