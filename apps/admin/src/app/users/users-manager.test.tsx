/************************************************************
 * Module Name  : UsersManager (component test)
 * Scope        : Admin Portal — Users & Roles at the active branch
 *
 * Description  : The screen shows who holds the active branch's Owner,
 *                Manager and Receptionist roles. Changing one goes through a
 *                person search (from 3 characters) and a confirmation that
 *                names the person and the branch; only the confirmation
 *                writes, and it sends the rendered branch and the holder it
 *                showed. Someone who can't take the role can't be picked and
 *                says why. An Owner can't change the Owner.
 *
 * Notes        : `fetch` is stubbed on the global (no MSW in the admin
 *                project). Toasts are mocked.
 ************************************************************/

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/admin/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { UsersManager } from './users-manager'

const person = (id: string, name: string, phone: string | null = null) => ({
  id,
  name,
  email: `${id}@example.com`,
  phone,
})

const HOLDERS = {
  branch: { id: 'rs', name: 'Rayasandra', code: 'RS', status: 'operational' },
  owner: person('own1', 'Roshini'),
  manager: person('mgr1', 'Manish'),
  receptionist: person('rec1', 'Rekha'),
  can: { setOwner: false, setManager: true, setReceptionist: true },
}

const KAVYA = {
  ...person('cus1', 'Kavya', '9876543210'),
  here: null,
  actions: ['set_manager', 'set_receptionist'],
  note: null,
}

const ASHA = {
  ...person('sty2', 'Asha'),
  here: null,
  actions: [],
  note: 'This person works at another branch.',
}

function ok(data: unknown): Response {
  return { ok: true, status: 200, json: async () => ({ success: true, data }) } as Response
}

function failed(status: number, message: string): Response {
  return {
    ok: false,
    status,
    json: async () => ({
      success: false,
      error: { code: 'CONFLICT', message, statusCode: status },
    }),
  } as Response
}

type FetchInit = { method?: string; body?: string }

function stubApi(options: { post?: Response; matches?: unknown[] } = {}) {
  const fetchMock = vi.fn((url: string, init?: FetchInit) => {
    if (init?.method === 'POST') {
      return Promise.resolve(options.post ?? ok({ changed: true }))
    }
    if (url.startsWith('/api/users?search=')) {
      return Promise.resolve(ok({ branchId: 'rs', users: options.matches ?? [KAVYA, ASHA] }))
    }
    return Promise.resolve(ok(HOLDERS))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const posts = (fetchMock: ReturnType<typeof stubApi>) =>
  fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')

const holderLoads = (fetchMock: ReturnType<typeof stubApi>) =>
  fetchMock.mock.calls.filter(([url]) => url === '/api/users/branch-roles')

async function section(name: string) {
  return screen.findByRole('region', { name })
}

async function searchFor(region: HTMLElement, term: string) {
  fireEvent.click(within(region).getByRole('button', { name: 'Change' }))
  fireEvent.change(within(region).getByLabelText(/Find the new/), { target: { value: term } })
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('UsersManager holders', () => {
  it('shows who holds each role at the active branch', async () => {
    stubApi()
    render(<UsersManager />)

    expect(await screen.findByText('Rayasandra')).toBeInTheDocument()
    expect(within(await section('Owner')).getByText('Roshini')).toBeInTheDocument()
    expect(within(await section('Manager')).getByText('Manish')).toBeInTheDocument()
    expect(within(await section('Receptionist')).getByText('Rekha')).toBeInTheDocument()
  })

  it("doesn't let an Owner change the Owner", async () => {
    stubApi()
    render(<UsersManager />)

    const owner = await section('Owner')
    expect(within(owner).getByText('Only the Developer can change the Owner.')).toBeInTheDocument()
    expect(within(owner).queryByRole('button', { name: 'Change' })).toBeNull()
  })
})

describe('UsersManager changing a holder', () => {
  it('confirms, then sends the rendered branch and the holder it showed', async () => {
    const fetchMock = stubApi()
    render(<UsersManager />)

    await searchFor(await section('Manager'), 'kav')
    fireEvent.click(await screen.findByRole('button', { name: /Kavya/ }))

    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Make Kavya the Manager of Rayasandra?')).toBeInTheDocument()
    expect(within(dialog).getByText('cus1@example.com')).toBeInTheDocument()
    expect(within(dialog).getByText('9876543210')).toBeInTheDocument()
    expect(within(dialog).getByText(/Manish stops being the Manager here/)).toBeInTheDocument()
    expect(posts(fetchMock)).toHaveLength(0)

    fireEvent.click(within(dialog).getByRole('button', { name: 'Make Manager' }))

    await waitFor(() => expect(posts(fetchMock)).toHaveLength(1))
    expect(JSON.parse(posts(fetchMock)[0]?.[1]?.body ?? '{}')).toEqual({
      kind: 'set_manager',
      branchId: 'rs',
      userId: 'cus1',
      expectedHolderId: 'mgr1',
    })
    // The holders are read again after the change.
    await waitFor(() => expect(holderLoads(fetchMock)).toHaveLength(2))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  })

  it("can't pick someone who can't take the role, and says why", async () => {
    stubApi()
    render(<UsersManager />)

    await searchFor(await section('Receptionist'), 'ash')
    const asha = await screen.findByRole('button', { name: /Asha/ })
    expect(asha).toBeDisabled()
    expect(within(asha).getByText('This person works at another branch.')).toBeInTheDocument()
  })

  it('needs 3 characters before it searches', async () => {
    const fetchMock = stubApi()
    render(<UsersManager />)

    await searchFor(await section('Manager'), 'ka')
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(fetchMock.mock.calls.some(([url]) => url.startsWith('/api/users?search='))).toBe(false)
  })

  it('removes the Receptionist after a confirmation', async () => {
    const fetchMock = stubApi()
    render(<UsersManager />)

    fireEvent.click(within(await section('Receptionist')).getByRole('button', { name: 'Remove' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Remove Rekha as Receptionist?')).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(posts(fetchMock)).toHaveLength(1))
    expect(JSON.parse(posts(fetchMock)[0]?.[1]?.body ?? '{}')).toEqual({
      kind: 'remove',
      branchId: 'rs',
      userId: 'rec1',
    })
  })

  it('keeps the dialog open with the server’s reason when the change is refused', async () => {
    stubApi({ post: failed(409, 'Someone changed this branch just now. Reload and try again.') })
    render(<UsersManager />)

    fireEvent.click(within(await section('Manager')).getByRole('button', { name: 'Remove' }))
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }))

    expect(
      await within(dialog).findByText(
        'Someone changed this branch just now. Reload and try again.',
      ),
    ).toBeInTheDocument()
  })
})
