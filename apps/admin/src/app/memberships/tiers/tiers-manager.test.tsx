/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 25-10-2026 & Updated - 25-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : TiersManager (component test)
 * Scope        : Admin Portal — membership tiers (multi-branch R9.4, MS-18)
 *
 * Description  : Lists tiers with their usual values; a 0-hour, ₹0 tier reads
 *                "Agreed at the counter". Adding a tier sends whole hours and
 *                paise and no SAC code unless the person is the Developer;
 *                editing sends only what changed; a tier is retired from the
 *                row menu. The SAC select is disabled for everyone but the
 *                Developer. Bad input is caught before sending. No
 *                accessibility violations on the list.
 *
 * Notes        : `fetch` is stubbed on the global; toasts are mocked. Radix
 *                needs a few DOM APIs jsdom omits, stubbed below.
 ************************************************************/

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }))
vi.mock('@/lib/admin/toast', () => ({ toast: toastMocks }))

import { TiersManager } from './tiers-manager'

expect.extend(toHaveNoViolations)

const GOLD = {
  id: 'tier_gold',
  name: 'Gold',
  slug: 'gold',
  description: null,
  defaultHoursMinutes: 900,
  defaultPricePaise: 1_500_000,
  defaultValidityDays: 90,
  sacCode: '999723',
  isActive: true,
  displayOrder: 2,
}
const PLATINUM = {
  ...GOLD,
  id: 'tier_platinum',
  name: 'Platinum',
  slug: 'platinum',
  defaultHoursMinutes: 0,
  defaultPricePaise: 0,
  displayOrder: 3,
}

type Call = { url: string; init: RequestInit | undefined }
let calls: Call[] = []
let canEditTax = false

function ok(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ success: true, data }), { status })
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
  canEditTax = false
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      if (init?.method === 'POST') {
        return ok({ tier: { ...GOLD, id: 'tier_new' } }, 201)
      }
      if (init?.method === 'PATCH') {
        return ok({ tier: GOLD })
      }
      return ok({ tiers: [GOLD, PLATINUM], canEditTax })
    }),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

const sent = (method: string) =>
  calls.filter((c) => c.init?.method === method).map((c) => JSON.parse(String(c.init?.body)))

async function rowMenu(name: string, item: string) {
  const cell = await screen.findByText(name)
  const row = cell.closest('tr')
  if (!row) {
    throw new Error(`no row for ${name}`)
  }
  fireEvent.keyDown(within(row).getByRole('button', { name: 'Row actions' }), { key: 'Enter' })
  fireEvent.click(await screen.findByRole('menuitem', { name: item }))
}

describe('TiersManager', () => {
  it('lists tiers with their usual values', async () => {
    const { container } = render(<TiersManager />)

    expect(await screen.findByText('Gold')).toBeInTheDocument()
    expect(screen.getByText('15 hours')).toBeInTheDocument()
    expect(screen.getByText('₹15,000.00')).toBeInTheDocument()
    expect(screen.getAllByText('Agreed at the counter')).toHaveLength(2)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('adds a tier in whole hours and paise, without a SAC code', async () => {
    render(<TiersManager />)
    await screen.findByText('Gold')

    fireEvent.click(screen.getByRole('button', { name: '+ Add Tier' }))
    const panel = await screen.findByRole('dialog')
    fireEvent.change(within(panel).getByLabelText(/^Name/), { target: { value: 'Diwali' } })
    fireEvent.change(within(panel).getByLabelText('Usual hours'), { target: { value: '10' } })
    fireEvent.change(within(panel).getByLabelText('Usual price (₹, GST-inclusive)'), {
      target: { value: '10,000' },
    })
    expect(within(panel).getByRole('combobox', { name: 'Tax classification (SAC)' })).toBeDisabled()
    fireEvent.click(within(panel).getByRole('button', { name: 'Add Tier' }))

    await waitFor(() => expect(sent('POST')).toHaveLength(1))
    expect(sent('POST')[0]).toEqual({
      name: 'Diwali',
      usualHours: 10,
      usualPricePaise: 1_000_000,
      usualValidityDays: 90,
      displayOrder: 4,
      isActive: true,
    })
  })

  it('edits only what changed', async () => {
    render(<TiersManager />)
    await rowMenu('Gold', 'Edit')
    const panel = await screen.findByRole('dialog')

    fireEvent.change(within(panel).getByLabelText('Usual price (₹, GST-inclusive)'), {
      target: { value: '16000' },
    })
    fireEvent.click(within(panel).getByRole('button', { name: 'Save Tier' }))

    await waitFor(() => expect(sent('PATCH')).toEqual([{ usualPricePaise: 1_600_000 }]))
    expect(calls.find((c) => c.init?.method === 'PATCH')?.url).toBe(
      '/api/membership-tiers/tier_gold',
    )
  })

  it('retires a tier from the row menu', async () => {
    render(<TiersManager />)
    await rowMenu('Gold', 'Retire')

    await waitFor(() => expect(sent('PATCH')).toEqual([{ isActive: false }]))
    expect(toastMocks.success).toHaveBeenCalledWith('Gold retired')
  })

  it('lets the Developer change the SAC code', async () => {
    canEditTax = true
    render(<TiersManager />)
    await rowMenu('Gold', 'Edit')
    const panel = await screen.findByRole('dialog')

    const sac = within(panel).getByRole('combobox', { name: 'Tax classification (SAC)' })
    expect(sac).toBeEnabled()
    fireEvent.keyDown(sac, { key: 'Enter' })
    fireEvent.click(await screen.findByRole('option', { name: /999729/ }))
    fireEvent.click(within(panel).getByRole('button', { name: 'Save Tier' }))

    await waitFor(() => expect(sent('PATCH')).toEqual([{ sacCode: '999729' }]))
  })

  it('catches part of an hour before sending', async () => {
    render(<TiersManager />)
    await rowMenu('Gold', 'Edit')
    const panel = await screen.findByRole('dialog')

    fireEvent.change(within(panel).getByLabelText('Usual hours'), { target: { value: '7.5' } })
    fireEvent.click(within(panel).getByRole('button', { name: 'Save Tier' }))

    expect(
      await within(panel).findByText('Usual hours are whole hours, 0 to 500.'),
    ).toBeInTheDocument()
    expect(sent('PATCH')).toEqual([])
  })
})
