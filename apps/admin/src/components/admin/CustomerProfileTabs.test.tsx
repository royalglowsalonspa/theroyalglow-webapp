/************************************************************
 * Module Name  : CustomerProfileTabs (component test)
 * Scope        : Admin Portal — one branch's view of a shared customer (R3)
 *
 * Description  : The history tab shows the active branch's bookings with their
 *                amounts and other branches' visits without them; the notes
 *                tab sends the rendered branch and the writer's visibility
 *                choice, private to the branch unless they choose to share.
 *
 * Tech Stack   : Vitest, @testing-library/react, jsdom
 *
 * Notes        : `fetch` is stubbed on the global; no network access occurs.
 ************************************************************/

import type { CustomerHistoryEntry, CustomerNoteView } from '@rgss/types'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CustomerProfileTabs } from './CustomerProfileTabs'

const BRANCH = { id: 'branch_rs', name: 'Rayasandra' }

const HISTORY: CustomerHistoryEntry[] = [
  {
    scope: 'other_branch',
    branchName: 'Marathahalli',
    bookingDate: '2026-10-25',
    startTime: '16:00:00',
    serviceType: 'spa',
    services: ['Swedish massage'],
  },
  {
    scope: 'this_branch',
    bookingId: 'bk_rs',
    bookingNumber: 'BK-RS-2610-H-11111',
    bookingDate: '2026-10-20',
    startTime: '10:00:00',
    serviceType: 'salon',
    status: 'completed',
    isMembershipSession: false,
    totalAmountPaise: 150_000,
    services: ['Haircut', 'Head massage'],
  },
]

const SHARED_NOTE: CustomerNoteView = {
  id: 'note_mh',
  content: 'Allergic to lavender oil',
  authorName: 'Priya',
  branchName: 'Marathahalli',
  visibility: 'shared',
  createdAt: '2026-10-01T09:00:00.000Z',
}

function renderTabs(notes: CustomerNoteView[] = []) {
  return render(
    <CustomerProfileTabs
      customerId="cust_1"
      branch={BRANCH}
      tags={[]}
      allTags={[]}
      gemsBalance={0}
      history={HISTORY}
      invoices={[]}
      membership={{ active: null, past: [] }}
      notes={notes}
    />,
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('CustomerProfileTabs — history', () => {
  it('shows this branch’s amount and booking link, and no amount for other branches', () => {
    renderTabs()

    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1)
    const [elsewhere, own] = rows
    if (!elsewhere || !own) {
      throw new Error('expected two history rows')
    }

    expect(within(elsewhere).getByText('Marathahalli')).toBeInTheDocument()
    expect(within(elsewhere).getByText('Swedish massage')).toBeInTheDocument()
    expect(within(elsewhere).getByText('Not shown for another branch')).toBeInTheDocument()
    expect(within(elsewhere).queryByRole('link')).toBeNull()

    expect(within(own).getByText('Rayasandra')).toBeInTheDocument()
    expect(within(own).getByText('Haircut, Head massage')).toBeInTheDocument()
    expect(within(own).getByText('₹1,500')).toBeInTheDocument()
    expect(within(own).getByRole('link', { name: 'BK-RS-2610-H-11111' })).toHaveAttribute(
      'href',
      '/bookings/bk_rs',
    )
  })
})

describe('CustomerProfileTabs — notes', () => {
  function openNotes() {
    fireEvent.click(screen.getByRole('tab', { name: 'Notes' }))
  }

  it('labels a shared note from another branch', () => {
    renderTabs([SHARED_NOTE])
    openNotes()

    expect(screen.getByText('Allergic to lavender oil')).toBeInTheDocument()
    expect(screen.getByText('All branches')).toBeInTheDocument()
    expect(screen.getByText(/Priya · Marathahalli/)).toBeInTheDocument()
  })

  it('saves a note private to the branch unless the writer shares it', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const sent = JSON.parse(String(init?.body))
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            note: {
              id: `note_${sent.visibility}`,
              content: sent.content,
              visibility: sent.visibility,
              branchName: BRANCH.name,
              createdAt: '2026-10-30T09:00:00.000Z',
            },
          },
        }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      )
    })
    vi.stubGlobal('fetch', fetchMock)
    renderTabs()
    openNotes()

    expect(screen.getByRole('radio', { name: 'Rayasandra only' })).toBeChecked()

    fireEvent.change(screen.getByLabelText('Add a note'), { target: { value: 'Prefers Anjali' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Note' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/customers/cust_1/notes')
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      branchId: 'branch_rs',
      content: 'Prefers Anjali',
      visibility: 'branch',
    })
    expect(
      within(await noteCard('Prefers Anjali')).getByText('Rayasandra only'),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: 'All Royal Glow branches' }))
    fireEvent.change(screen.getByLabelText('Add a note'), { target: { value: 'VIP guest' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Note' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({
      visibility: 'shared',
    })
    expect(within(await noteCard('VIP guest')).getByText('All branches')).toBeInTheDocument()
  })

  /** The saved note's card, found by its text. */
  async function noteCard(content: string): Promise<HTMLElement> {
    const card = (await screen.findByText(content)).parentElement
    if (!card) {
      throw new Error(`no card for ${content}`)
    }
    return card
  }
})
