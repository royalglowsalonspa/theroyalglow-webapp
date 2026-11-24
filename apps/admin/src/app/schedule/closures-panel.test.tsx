/************************************************************
 * Module Name  : ClosuresPanel (component test)
 * Scope        : Admin Portal — Schedule closures (multi-branch R1.8)
 *
 * Description  : The panel lists the active branch's closures, offers
 *                Reopen only where the viewer may remove the closure, sends
 *                the rendered branch with every write, offers "Close every
 *                branch" to the Developer only, and lists the bookings a new
 *                closure leaves to move. No accessibility violations.
 *
 * Notes        : `fetch` is stubbed on the global; toasts are mocked.
 ************************************************************/

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }))
vi.mock('@/lib/admin/toast', () => ({ toast: toastMocks }))

import { ClosuresPanel } from './closures-panel'

expect.extend(toHaveNoViolations)

const LIST = {
  branchId: 'branch_rs',
  canCloseAllBranches: false,
  closures: [
    { id: 'cl_all', date: '2026-11-08', name: 'Diwali', allBranches: true, canRemove: false },
    { id: 'cl_rs', date: '2026-11-20', name: 'Renovation', allBranches: false, canRemove: true },
  ],
}

type Call = { url: string; init: RequestInit | undefined }
let calls: Call[] = []
let listData: typeof LIST = LIST
let postResponse: { status: number; body: unknown } = {
  status: 201,
  body: { success: true, data: { closures: [], alreadyClosed: [], affectedBookings: [] } },
}

function ok(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ success: true, data }), { status })
}

beforeEach(() => {
  calls = []
  listData = LIST
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      if (init?.method === 'POST') {
        return new Response(JSON.stringify(postResponse.body), { status: postResponse.status })
      }
      if (init?.method === 'DELETE') {
        return ok({ ok: true })
      }
      return ok(listData)
    }),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

async function renderPanel(onChanged = vi.fn()) {
  const view = render(<ClosuresPanel onChanged={onChanged} />)
  await screen.findByText('Renovation')
  return { ...view, onChanged }
}

describe('ClosuresPanel', () => {
  it('lists closures and offers Reopen only where the viewer may remove it', async () => {
    const { container } = await renderPanel()

    const list = screen.getByRole('list')
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(within(items[0] as HTMLElement).getByText('All branches')).toBeInTheDocument()
    expect(within(items[0] as HTMLElement).queryByRole('button')).toBeNull()
    expect(
      within(items[1] as HTMLElement).getByRole('button', { name: /Reopen .* \(Renovation\)/ }),
    ).toBeInTheDocument()
    // Only the Developer sees the every-branch option.
    expect(screen.queryByLabelText('Close every branch')).toBeNull()
    expect(await axe(container)).toHaveNoViolations()
  })

  it('reopens a day with the rendered branch, then refreshes', async () => {
    const { onChanged } = await renderPanel()

    fireEvent.click(screen.getByRole('button', { name: /Reopen .* \(Renovation\)/ }))

    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    const del = calls.find((c) => c.init?.method === 'DELETE')
    expect(del?.url).toBe('/api/closures/cl_rs?branchId=branch_rs')
    expect(toastMocks.success).toHaveBeenCalledWith('Reopened 20/11/2026')
  })

  it('closes a range with the rendered branch and lists the bookings left to move', async () => {
    postResponse = {
      status: 201,
      body: {
        success: true,
        data: {
          closures: [
            {
              id: 'n1',
              date: '2026-12-24',
              name: 'Staff training',
              allBranches: false,
              canRemove: true,
            },
            {
              id: 'n2',
              date: '2026-12-25',
              name: 'Staff training',
              allBranches: false,
              canRemove: true,
            },
          ],
          alreadyClosed: [],
          affectedBookings: [
            {
              id: 'bk_1',
              bookingNumber: 'BK-RS-2612-H-12345',
              branchName: 'Rayasandra',
              date: '2026-12-24',
              startTime: '11:00',
              status: 'confirmed',
              customerName: 'Priya',
            },
          ],
        },
      },
    }
    const { onChanged } = await renderPanel()

    fireEvent.change(screen.getByLabelText(/First day/), { target: { value: '2026-12-24' } })
    fireEvent.change(screen.getByLabelText(/Last day/), { target: { value: '2026-12-25' } })
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: '  Staff training ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add closure' }))

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('1 booking is on a closed day')).toBeInTheDocument()
    expect(within(alert).getByRole('link', { name: '#BK-RS-2612-H-12345' })).toHaveAttribute(
      'href',
      '/bookings/bk_1',
    )
    const post = calls.find((c) => c.init?.method === 'POST')
    expect(JSON.parse(String(post?.init?.body))).toEqual({
      branchId: 'branch_rs',
      date: '2026-12-24',
      endDate: '2026-12-25',
      name: 'Staff training',
    })
    expect(toastMocks.success).toHaveBeenCalledWith('Closed 2 days')
    expect(onChanged).toHaveBeenCalled()
  })

  it('shows the server refusal inline', async () => {
    postResponse = {
      status: 409,
      body: {
        success: false,
        error: { code: 'BRANCH_CONTEXT_CHANGED', message: 'You switched to Marathahalli.' },
      },
    }
    await renderPanel()

    fireEvent.change(screen.getByLabelText(/First day/), { target: { value: '2026-12-24' } })
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: 'Training' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add closure' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('You switched to Marathahalli.')
  })

  it('lets the Developer close every branch', async () => {
    listData = { ...LIST, canCloseAllBranches: true }
    await renderPanel()

    fireEvent.change(screen.getByLabelText(/First day/), { target: { value: '2026-12-31' } })
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: 'New Year' } })
    fireEvent.click(screen.getByLabelText('Close every branch'))
    fireEvent.click(screen.getByRole('button', { name: 'Add closure' }))

    await waitFor(() => expect(calls.some((c) => c.init?.method === 'POST')).toBe(true))
    const post = calls.find((c) => c.init?.method === 'POST')
    expect(JSON.parse(String(post?.init?.body))).toMatchObject({ allBranches: true })
  })
})
