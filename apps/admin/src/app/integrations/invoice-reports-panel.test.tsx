import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { InvoiceReportsPanel } from './invoice-reports-panel'

const branch = { id: 'branch-a', name: 'East branch' }
const endpoint = '/api/invoice-reconciliation'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('publishes only on submit and uses the previous IST month for billing source coverage', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-30T18:30:00.000Z'))
  const request = vi.fn(async (url: string, options?: RequestInit) => {
    if (url === '/api/branches')
      return Response.json({ success: true, data: { branches: [branch] } })
    if (url !== endpoint || options?.method !== 'POST') throw new Error('Unexpected request')
    return Response.json({
      success: true,
      data: { branchId: branch.id, month: '2026-11', status: 'unchanged' },
    })
  })
  vi.stubGlobal('fetch', request)
  render(<InvoiceReportsPanel />)

  await screen.findByRole('option', { name: branch.name })
  expect(screen.getByRole('button', { name: 'Publish report' })).toBeDisabled()
  expect(screen.getByLabelText('Report month (IST)')).toHaveValue('2026-12')
  fireEvent.change(screen.getByRole('combobox', { name: 'Branch' }), {
    target: { value: branch.id },
  })
  fireEvent.change(screen.getByRole('combobox', { name: 'Report' }), {
    target: { value: 'coverage' },
  })
  expect(screen.getByLabelText('Report month (IST)')).toHaveValue('2026-11')
  expect(request.mock.calls.map(([url]) => url)).toEqual(['/api/branches'])

  fireEvent.click(screen.getByRole('button', { name: 'Publish report' }))
  expect(await screen.findByText(/portal kept its existing snapshot/i)).toBeVisible()
  const [url, options] = request.mock.calls[1] ?? []
  expect(url).toBe(endpoint)
  expect(options?.method).toBe('POST')
  expect(JSON.parse(String(options?.body))).toEqual({ branchId: branch.id, month: '2026-11' })
})

it('publishes an explicit report for the selected month and rejects an acknowledgement for another branch', async () => {
  const request = vi.fn(async (url: string, options?: RequestInit) => {
    if (url === '/api/branches')
      return Response.json({ success: true, data: { branches: [branch] } })
    if (url !== endpoint || options?.method !== 'POST') throw new Error('Unexpected request')
    return Response.json({
      success: true,
      data: { branchId: 'branch-b', month: '2026-10', status: 'published' },
    })
  })
  vi.stubGlobal('fetch', request)
  render(<InvoiceReportsPanel />)

  await screen.findByRole('option', { name: branch.name })
  fireEvent.change(screen.getByRole('combobox', { name: 'Branch' }), {
    target: { value: branch.id },
  })
  fireEvent.change(screen.getByRole('combobox', { name: 'Report' }), {
    target: { value: 'checkout_collections' },
  })
  fireEvent.change(screen.getByLabelText('Report month (IST)'), { target: { value: '2026-10' } })
  fireEvent.click(screen.getByRole('button', { name: 'Publish report' }))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/could not confirm/i))
  expect(screen.queryByText(/published to the invoice portal/i)).toBeNull()
  expect(JSON.parse(String(request.mock.calls[1]?.[1]?.body))).toEqual({
    branchId: branch.id,
    month: '2026-10',
    report: 'checkout_collections',
  })
})
