/************************************************************
 * Module Name  : StaffManager (component test)
 * Scope        : Admin Portal — Staff at the active branch (R1.11)
 *
 * Description  : The Staff page lists the active branch's people. Add staff
 *                picks an existing account through the person search and
 *                sends the rendered branch with a Stylist or Therapist title;
 *                someone who can't be added can't be picked and says why.
 *                Remove warns about upcoming bookings before it writes, and
 *                only Stylists and Therapists offer Remove. There is no
 *                active toggle.
 *
 * Notes        : `fetch` is stubbed on the global; toasts are mocked. Radix
 *                needs a few DOM APIs jsdom omits, stubbed below.
 ************************************************************/

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }))
vi.mock('@/lib/admin/toast', () => ({ toast: toastMocks }))

import { StaffManager } from './staff-manager'

const row = (overrides: Record<string, unknown>) => ({
  userId: 'u',
  email: 'x@example.com',
  phone: null,
  bio: null,
  specialization: null,
  hireDate: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  serviceCount: 0,
  ...overrides,
})

const PAGE = {
  branch: { id: 'rs', name: 'Rayasandra', code: 'RS' },
  staff: [
    row({
      id: 'st_sty1',
      name: 'Asha',
      designation: 'stylist',
      roleWitness: 'staff',
      canEdit: true,
      canRemove: true,
    }),
    row({
      id: 'st_rec1',
      name: 'Rekha',
      designation: 'receptionist',
      roleWitness: 'receptionist',
      canEdit: false,
      canRemove: false,
    }),
  ],
}

const CANDIDATES = [
  {
    id: 'cus1',
    name: 'Kavya',
    email: 'kavya@example.com',
    phone: '9876543210',
    available: true,
    reason: null,
  },
  {
    id: 'own2',
    name: 'Kiran',
    email: 'kiran@example.com',
    phone: null,
    available: false,
    reason: 'This person already has a role. They must be removed from it first.',
  },
]

function ok(data: unknown): Response {
  return { ok: true, status: 200, json: async () => ({ success: true, data }) } as Response
}

type FetchInit = { method?: string; body?: string }

function stubApi() {
  const fetchMock = vi.fn((url: string, init?: FetchInit) => {
    if (init?.method === 'POST') {
      return Promise.resolve(ok({ changed: true, reassignments: 2, liveUpdates: 'stopped' }))
    }
    if (url.startsWith('/api/staff/candidates')) {
      return Promise.resolve(ok({ branchId: 'rs', people: CANDIDATES }))
    }
    if (url === '/api/staff/st_sty1') {
      return Promise.resolve(ok({ staff: { serviceIds: [], upcomingAssignments: 2 } }))
    }
    if (url === '/api/services/all') {
      return Promise.resolve(ok({ services: [] }))
    }
    return Promise.resolve(ok(PAGE))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const posts = (fetchMock: ReturnType<typeof stubApi>) =>
  fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {}
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {}
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {}
  }
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
  }
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function openRowActions(name: string) {
  const cell = await screen.findByText(name)
  const tableRow = cell.closest('tr')
  if (!tableRow) {
    throw new Error(`no row for ${name}`)
  }
  const trigger = within(tableRow).queryByRole('button', { name: 'Row actions' })
  if (trigger) {
    fireEvent.keyDown(trigger, { key: 'Enter' })
  }
  return trigger
}

describe('StaffManager', () => {
  it("lists the active branch's people, without an active toggle", async () => {
    stubApi()
    render(<StaffManager />)

    expect(await screen.findByText('Staff · Rayasandra')).toBeInTheDocument()
    expect(await screen.findByText('Asha')).toBeInTheDocument()
    expect(screen.getByText('Rekha')).toBeInTheDocument()
    expect(screen.queryByText(/Active \(available for bookings\)/)).toBeNull()
    expect(screen.queryByRole('columnheader', { name: /Status/ })).toBeNull()
  })

  it('adds a person found by the search, with the rendered branch', async () => {
    const fetchMock = stubApi()
    render(<StaffManager />)
    await screen.findByText('Asha')

    fireEvent.click(screen.getByRole('button', { name: 'Add staff' }))
    fireEvent.change(await screen.findByLabelText('Find a person'), { target: { value: 'kav' } })
    fireEvent.click(await screen.findByRole('button', { name: /Kavya/ }))
    fireEvent.change(screen.getByPlaceholderText('e.g. Bridal makeup'), {
      target: { value: '  Bridal  ' },
    })
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add staff' }))

    await waitFor(() => expect(posts(fetchMock)).toHaveLength(1))
    const [url, init] = posts(fetchMock)[0] ?? []
    expect(url).toBe('/api/staff')
    expect(JSON.parse(init?.body ?? '{}')).toEqual({
      branchId: 'rs',
      userId: 'cus1',
      designation: 'stylist',
      specialization: 'Bridal',
    })
  })

  it("can't pick someone who already has a role", async () => {
    stubApi()
    render(<StaffManager />)
    await screen.findByText('Asha')

    fireEvent.click(screen.getByRole('button', { name: 'Add staff' }))
    fireEvent.change(await screen.findByLabelText('Find a person'), { target: { value: 'kir' } })
    const kiran = await screen.findByRole('button', { name: /Kiran/ })
    expect(kiran).toBeDisabled()
    expect(within(kiran).getByText(/already has a role/)).toBeInTheDocument()
  })

  it('warns about upcoming bookings, then removes a Stylist', async () => {
    const fetchMock = stubApi()
    render(<StaffManager />)

    await openRowActions('Asha')
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Remove' }))

    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Remove Asha from Rayasandra?')).toBeInTheDocument()
    expect(await within(dialog).findByText(/2 upcoming bookings name them/)).toBeInTheDocument()
    expect(posts(fetchMock)).toHaveLength(0)

    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(posts(fetchMock)).toHaveLength(1))
    const [url, init] = posts(fetchMock)[0] ?? []
    expect(url).toBe('/api/staff/st_sty1/remove')
    expect(JSON.parse(init?.body ?? '{}')).toEqual({ branchId: 'rs' })
    // The removal released their bookings to the dashboard (R1.7).
    await waitFor(() =>
      expect(toastMocks.warning).toHaveBeenCalledWith(
        '2 bookings need someone else. They’re listed on the dashboard.',
      ),
    )
  })

  it('offers no actions on the Receptionist to a Manager', async () => {
    stubApi()
    render(<StaffManager />)

    await openRowActions('Rekha')
    expect(screen.queryByRole('menuitem', { name: 'Remove' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: 'Edit' })).toBeNull()
  })
})
