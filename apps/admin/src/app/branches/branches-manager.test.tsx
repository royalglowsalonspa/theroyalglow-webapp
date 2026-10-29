/************************************************************
 * Module Name  : BranchesManager (component test)
 * Scope        : Admin Portal — Branch management (multi-branch R1.1, R1.10)
 *
 * Description  : Only the Developer gets row actions. Delete is offered on a
 *                shut-down branch only, asks first, and says what happened to
 *                the Owner; a refusal stays in the dialog. Choosing Shutdown
 *                for an open branch lists what is still open there and holds
 *                the save until the check is clear; a refusal from the server
 *                checks again. No accessibility violations on the list.
 *
 * Notes        : `fetch` is stubbed on the global; toasts are mocked. Radix
 *                needs a few DOM APIs jsdom omits, stubbed below.
 ************************************************************/

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }))
vi.mock('@/lib/admin/toast', () => ({ toast: toastMocks }))

import { BranchesManager } from './branches-manager'

expect.extend(toHaveNoViolations)

const BASE = {
  addressLine1: '1 Hosur Road',
  addressLine2: null,
  city: 'Bengaluru',
  state: 'Karnataka',
  pincode: '560100',
  phone: '+91 80 1234 5678',
  email: null,
  googleMapsUrl: null,
  googleMapsPlaceId: null,
  latitude: null,
  longitude: null,
  openingDate: null,
  closingDate: null,
  temporaryCloseReason: null,
  isPrimary: false,
  displayOrder: 0,
}

const RAYASANDRA = {
  ...BASE,
  id: 'branch_rs',
  number: 1,
  code: 'RS',
  name: 'Rayasandra',
  status: 'operational',
  isPrimary: true,
}

const OLD_TOWN = {
  ...BASE,
  id: 'branch_ot',
  number: 3,
  code: 'OT',
  name: 'Old Town',
  status: 'shutdown',
}

const BLOCKED = {
  clear: false,
  lines: [
    'Move the Manager, Meera, in Users & Roles.',
    'Complete, cancel or move 2 bookings still to happen.',
  ],
}
const CLEAR = { clear: true, lines: [] }

type Reply = { status: number; body: unknown }
type Call = { url: string; init: RequestInit | undefined }

let calls: Call[] = []
let canEdit = true
let checks: (typeof BLOCKED | typeof CLEAR)[] = []
let patchReply: Reply = { status: 200, body: { success: true, data: { branch: {} } } }
let deleteReply: Reply = {
  status: 200,
  body: {
    success: true,
    data: { deleted: true, ownerReturnedToCustomer: null, liveUpdates: 'none' },
  },
}

function reply({ status, body }: Reply): Response {
  return new Response(JSON.stringify(body), { status })
}

function ok(data: unknown): Response {
  return reply({ status: 200, body: { success: true, data } })
}

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

beforeEach(() => {
  calls = []
  canEdit = true
  checks = []
  patchReply = { status: 200, body: { success: true, data: { branch: {} } } }
  deleteReply = {
    status: 200,
    body: {
      success: true,
      data: { deleted: true, ownerReturnedToCustomer: null, liveUpdates: 'none' },
    },
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      if (init?.method === 'PATCH') {
        return reply(patchReply)
      }
      if (init?.method === 'DELETE') {
        return reply(deleteReply)
      }
      if (url.endsWith('/shutdown-check')) {
        return ok(checks.shift() ?? CLEAR)
      }
      return ok({ branches: [RAYASANDRA, OLD_TOWN], canEdit })
    }),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

const sent = (method: string) => calls.filter((c) => c.init?.method === method)
const checkCalls = () => calls.filter((c) => c.url.endsWith('/shutdown-check'))
const listCalls = () => calls.filter((c) => c.url === '/api/branches' && !c.init?.method)

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

/** Open the editor for `name` and choose a status. */
async function editWithStatus(name: string, statusLabel: string) {
  await openRowActions(name)
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
  const dialog = await screen.findByRole('dialog')
  fireEvent.keyDown(within(dialog).getByRole('combobox', { name: 'Status' }), { key: 'Enter' })
  fireEvent.click(await screen.findByRole('option', { name: statusLabel }))
  return dialog
}

describe('BranchesManager', () => {
  it('offers Delete on a shut-down branch only', async () => {
    const { container } = render(<BranchesManager />)
    await screen.findByText('Old Town')
    expect(await axe(container)).toHaveNoViolations()

    await openRowActions('Rayasandra')
    expect(await screen.findByRole('menuitem', { name: 'Edit' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Delete' })).toBeNull()
  })

  it('gives no row actions to anyone but the Developer', async () => {
    canEdit = false
    render(<BranchesManager />)

    expect(await openRowActions('Old Town')).toBeNull()
    expect(screen.queryByRole('button', { name: '+ Branch' })).toBeNull()
  })

  it('asks first, deletes, and says what happened to the Owner', async () => {
    deleteReply = {
      status: 200,
      body: {
        success: true,
        data: { deleted: true, ownerReturnedToCustomer: 'u_owner', liveUpdates: 'retrying' },
      },
    }
    render(<BranchesManager />)

    await openRowActions('Old Town')
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Delete Old Town?')).toBeInTheDocument()
    expect(within(dialog).getByText(/return to Customer/)).toBeInTheDocument()
    expect(sent('DELETE')).toHaveLength(0)

    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(sent('DELETE')).toHaveLength(1))
    expect(sent('DELETE')[0]?.url).toBe('/api/branches/branch_ot')
    await waitFor(() =>
      expect(toastMocks.success).toHaveBeenCalledWith(
        'Old Town deleted. Its Owner is now a Customer',
      ),
    )
    expect(toastMocks.warning).toHaveBeenCalledWith(expect.stringMatching(/live updates/))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    await waitFor(() => expect(listCalls()).toHaveLength(2))
  })

  it('keeps a refused delete in the dialog', async () => {
    deleteReply = {
      status: 409,
      body: {
        success: false,
        error: {
          code: 'BRANCH_NOT_EMPTY',
          message:
            'Old Town has bookings, invoices or other records, so it stays as a shut-down branch.',
          statusCode: 409,
        },
      },
    }
    render(<BranchesManager />)

    await openRowActions('Old Town')
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      /stays as a shut-down branch/,
    )
    expect(toastMocks.error).toHaveBeenCalledWith(
      'Could not delete branch',
      expect.stringContaining('Old Town has bookings'),
    )
    expect(toastMocks.success).not.toHaveBeenCalled()
    expect(listCalls()).toHaveLength(1)
  })

  it('lists what is still open and holds the shutdown until it is clear', async () => {
    checks = [BLOCKED, CLEAR]
    render(<BranchesManager />)

    const dialog = await editWithStatus('Rayasandra', 'Shutdown')

    expect(
      await within(dialog).findByText('Move the Manager, Meera, in Users & Roles.'),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByText('Complete, cancel or move 2 bookings still to happen.'),
    ).toBeInTheDocument()
    expect(checkCalls()[0]?.url).toBe('/api/branches/branch_rs/shutdown-check')
    const submit = within(dialog).getByRole('button', { name: 'Shut down' })
    expect(submit).toBeDisabled()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Check again' }))
    expect(await within(dialog).findByText(/Nothing is open at Rayasandra/)).toBeInTheDocument()
    await waitFor(() => expect(submit).toBeEnabled())

    fireEvent.click(submit)
    await waitFor(() => expect(sent('PATCH')).toHaveLength(1))
    const [patch] = sent('PATCH')
    expect(patch?.url).toBe('/api/branches/branch_rs')
    expect(JSON.parse(String(patch?.init?.body ?? '{}'))).toMatchObject({ status: 'shutdown' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('checks again when the server refuses the shutdown', async () => {
    checks = [CLEAR, BLOCKED]
    patchReply = {
      status: 409,
      body: {
        success: false,
        error: {
          code: 'BRANCH_SHUTDOWN_BLOCKED',
          message: "Rayasandra can't shut down yet. Move the Manager, Meera, in Users & Roles.",
          statusCode: 409,
        },
      },
    }
    render(<BranchesManager />)

    const dialog = await editWithStatus('Rayasandra', 'Shutdown')
    await within(dialog).findByText(/Nothing is open at Rayasandra/)
    const submit = within(dialog).getByRole('button', { name: 'Shut down' })
    await waitFor(() => expect(submit).toBeEnabled())
    fireEvent.click(submit)

    expect(
      await within(dialog).findByText(
        "Rayasandra can't shut down yet. Resolve what's listed above, then try again.",
      ),
    ).toBeInTheDocument()
    expect(
      await within(dialog).findByText('Move the Manager, Meera, in Users & Roles.'),
    ).toBeInTheDocument()
    expect(checkCalls()).toHaveLength(2)
    expect(within(dialog).getByRole('button', { name: 'Shut down' })).toBeDisabled()
  })

  it('runs no check when the branch is not being shut down', async () => {
    render(<BranchesManager />)

    // Already shut down: saving its details is a plain save.
    await openRowActions('Old Town')
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeEnabled()
    expect(checkCalls()).toHaveLength(0)
  })
})
