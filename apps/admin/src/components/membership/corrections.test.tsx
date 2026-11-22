import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CorrectionHistory, MembershipCorrectionForm } from './corrections'

const target = {
  branchId: 'branch_mh',
  branchName: 'Marathahalli',
  membershipId: 'membership_1',
  bookingId: 'booking_1',
  originalInvoiceId: 'invoice_1',
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('shows the signed correction, its reason and a link to the original invoice', () => {
  render(
    <CorrectionHistory
      showInvoiceLinks
      corrections={[
        {
          id: 'correction_1',
          originalInvoiceId: target.originalInvoiceId,
          invoiceNumber: 'MH/2627/000042',
          availableMinutesDelta: 30,
          reason: 'Correct the duplicate debit',
          evidenceReference: 'Counter log 42',
          performedByName: 'Asha',
          performedAt: '2026-11-22T09:00:00.000Z',
        },
      ]}
    />,
  )

  expect(screen.getByText('+30 available minutes')).toBeInTheDocument()
  expect(screen.getByText('Correct the duplicate debit')).toBeInTheDocument()
  expect(screen.getByText('Evidence reference: Counter log 42')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'MH/2627/000042' })).toHaveAttribute(
    'href',
    '/billing/invoice_1',
  )
})

it('retries an uncertain submission with the same operation key and rendered branch', async () => {
  const fetchMock = vi.fn<typeof fetch>()
  fetchMock.mockRejectedValueOnce(new Error('Connection interrupted'))
  fetchMock.mockResolvedValueOnce(Response.json({ success: true, data: { duplicate: true } }))
  vi.stubGlobal('fetch', fetchMock)
  const onSaved = vi.fn()
  render(<MembershipCorrectionForm target={target} onSaved={onSaved} />)

  fireEvent.change(screen.getByLabelText('Available minutes change'), { target: { value: '-30' } })
  fireEvent.change(screen.getByLabelText('Reason for correction'), {
    target: { value: 'Adjust minutes after review' },
  })
  fireEvent.change(screen.getByLabelText('Evidence reference (optional)'), {
    target: { value: 'Counter log 42' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Save correction' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Connection interrupted')
  fireEvent.click(screen.getByRole('button', { name: 'Save correction' }))

  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce())
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
    '/api/memberships/corrections',
    '/api/memberships/corrections',
  ])
  const first = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
  const second = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))
  expect(second).toEqual(first)
  expect(first).toEqual({
    branchId: target.branchId,
    membershipId: target.membershipId,
    bookingId: target.bookingId,
    originalInvoiceId: target.originalInvoiceId,
    availableMinutesDelta: -30,
    reason: 'Adjust minutes after review',
    evidenceReference: 'Counter log 42',
    idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/u),
  })
})
