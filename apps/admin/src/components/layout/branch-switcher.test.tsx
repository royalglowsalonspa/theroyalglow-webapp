/************************************************************
 * Module Name  : BranchSwitcher (component test)
 * Scope        : Admin Portal — Sidebar footer (multi-branch R2.1, R2.4)
 *
 * Description  : The switcher shows the branches the server says the person
 *                can work in, with their role and status, and the active one.
 *                Choosing another branch stores it through PUT /api/me/branch
 *                and reloads the page; a refused switch keeps the page and
 *                says why.
 *
 * Notes        : `fetch` and window.location.reload are stubbed. Radix needs a
 *                few DOM APIs jsdom omits, stubbed below.
 ************************************************************/

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { SidebarProvider } from '@/components/ui/sidebar'
import { BranchSwitcher } from './branch-switcher'

const BRANCHES = [
  {
    id: 'rs',
    name: 'Rayasandra',
    code: 'RS',
    status: 'operational',
    isPrimary: true,
    role: 'owner',
  },
  {
    id: 'mh',
    name: 'Marathahalli',
    code: 'MH',
    status: 'opens_soon',
    isPrimary: false,
    role: 'owner',
  },
]

function ok(data: unknown): Response {
  return { ok: true, status: 200, json: async () => ({ success: true, data }) } as Response
}

type FetchInit = { method?: string; body?: string }

function stubApi(put: Response = ok({ active: BRANCHES[1] })) {
  const fetchMock = vi.fn((_url: string, init?: FetchInit) =>
    Promise.resolve(init?.method === 'PUT' ? put : ok({ active: BRANCHES[0], branches: BRANCHES })),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const reload = vi.fn()

beforeAll(() => {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, reload },
  })
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false
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
  reload.mockClear()
})

async function openSwitcher() {
  render(
    <SidebarProvider>
      <BranchSwitcher />
    </SidebarProvider>,
  )
  const trigger = await screen.findByRole('button', { name: /Active branch: Rayasandra/ })
  fireEvent.keyDown(trigger, { key: 'Enter' })
}

describe('BranchSwitcher', () => {
  it('shows the active branch with the role held there', async () => {
    stubApi()
    await openSwitcher()

    expect(screen.getAllByText('Owner · Operational').length).toBeGreaterThan(0)
    expect(screen.getByRole('menuitem', { name: /Marathahalli/ })).toBeInTheDocument()
    expect(screen.getByText('Owner · Opens soon')).toBeInTheDocument()
  })

  it('stores the new branch and reloads the page', async () => {
    const fetchMock = stubApi()
    await openSwitcher()

    fireEvent.click(screen.getByRole('menuitem', { name: /Marathahalli/ }))

    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
    const putCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT')
    expect(JSON.parse(putCall?.[1]?.body ?? '{}')).toEqual({ branchId: 'mh' })
  })

  it('keeps the page and says why when the switch is refused', async () => {
    stubApi({
      ok: false,
      status: 404,
      json: async () => ({ success: false, error: { message: 'Branch not found.' } }),
    } as Response)
    await openSwitcher()

    fireEvent.click(screen.getByRole('menuitem', { name: /Marathahalli/ }))

    expect(await screen.findByText('Branch not found.')).toBeInTheDocument()
    expect(reload).not.toHaveBeenCalled()
  })
})
