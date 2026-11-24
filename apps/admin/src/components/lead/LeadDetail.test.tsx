import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LeadDetail } from './LeadDetail'

const replace = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }))

const lead = {
  id: 'lead_1',
  name: 'Test lead',
  branchId: 'branch_rs',
  phone: '+919876543210',
  status: 'new',
  source: 'manual',
  createdAt: '2026-11-20T10:00:00Z',
}
const destination = { id: 'branch_mh', name: 'Marathahalli' }

function stubFetch(
  destinations = [destination],
  moveResponse = Response.json({
    success: true,
    data: { destination },
  }),
) {
  const fetchMock = vi.fn(async (path: string, _init?: RequestInit) => {
    if (path.endsWith('/move')) return moveResponse
    return Response.json({ success: true, data: { lead, notes: [], destinations } })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function selectDestination() {
  fireEvent.click(await screen.findByRole('button', { name: 'Move to another branch' }))
  expect(screen.getByRole('button', { name: 'Move lead' })).toBeDisabled()
  fireEvent.keyDown(screen.getByRole('combobox', { name: 'Destination branch' }), { key: 'Enter' })
  fireEvent.click(await screen.findByRole('option', { name: destination.name }))
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('moving a lead to another branch', () => {
  it('submits the rendered source and selected branch and dismisses the source detail', async () => {
    const fetchMock = stubFetch()
    const onMoved = vi.fn()
    render(<LeadDetail leadId={lead.id} embedded onMoved={onMoved} />)
    await selectDestination()

    fireEvent.click(screen.getByRole('button', { name: 'Move lead' }))

    await waitFor(() => expect(onMoved).toHaveBeenCalledOnce())
    expect(fetchMock).toHaveBeenLastCalledWith('/api/leads/lead_1/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branchId: lead.branchId, toBranchId: destination.id }),
    })
    expect(screen.queryByRole('heading', { name: lead.name })).not.toBeInTheDocument()
    expect(replace).not.toHaveBeenCalled()
  })

  it('leaves the source detail open if the destination is no longer eligible', async () => {
    const message = 'Choose another branch that is accepting leads.'
    stubFetch([destination], Response.json({ success: false, error: { message } }, { status: 400 }))
    const onMoved = vi.fn()
    render(<LeadDetail leadId={lead.id} embedded onMoved={onMoved} />)
    await selectDestination()

    fireEvent.click(screen.getByRole('button', { name: 'Move lead' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(screen.getByRole('heading', { name: lead.name })).toBeInTheDocument()
    expect(onMoved).not.toHaveBeenCalled()
  })

  it('hides the move action when the API offers no destinations', async () => {
    stubFetch([])
    render(<LeadDetail leadId={lead.id} embedded />)

    expect(await screen.findByRole('heading', { name: lead.name })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Move to another branch' })).not.toBeInTheDocument()
  })
})
