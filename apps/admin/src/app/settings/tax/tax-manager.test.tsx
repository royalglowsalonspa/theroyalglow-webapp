/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 25-10-2026 & Updated - 25-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : TaxManager (component test)
 * Scope        : Admin Portal — branch tax rates (multi-branch R6.4, TX-01, TX-08, TX-10)
 *
 * Description  : Lists the active branch's rates with their state and review,
 *                and says whether the branch can invoice in the current mode:
 *                in live invoicing it names the legal name, GSTIN and
 *                reviewed rates still needed. Adding a rate sends basis points
 *                and the chosen start date; bad input is caught before
 *                sending, and a refusal stays in the panel. A provisional rate
 *                is marked reviewed after a confirmation; a reviewed one
 *                offers no action. No accessibility violations on the list.
 *
 * Notes        : `fetch` is stubbed on the global; toasts are mocked. Radix
 *                needs a few DOM APIs jsdom omits, stubbed below.
 ************************************************************/

import { financialYearIST } from '@rgss/business'
import type { TaxVersionView } from '@rgss/types'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }))
vi.mock('@/lib/admin/toast', () => ({ toast: toastMocks }))

import { percentToBps, ratePercentText, TaxManager, type TaxScreenData } from './tax-manager'

expect.extend(toHaveNoViolations)

function view(overrides: Partial<TaxVersionView>): TaxVersionView {
  return {
    id: 'v_now',
    branchId: 'branch_rs',
    sacCode: '999721',
    rateBps: 500,
    effectiveFrom: '2025-09-21T18:30:00.000Z',
    reviewStatus: 'provisional',
    reason: 'Provisional hair rate',
    createdByName: null,
    reviewedByName: null,
    reviewedAt: null,
    state: 'in_force',
    usedByInvoices: true,
    ...overrides,
  }
}

const VERSIONS: TaxVersionView[] = [
  view({
    id: 'v_next',
    rateBps: 1200,
    effectiveFrom: '2026-10-31T18:30:00.000Z',
    reason: 'Council revision',
    state: 'scheduled',
    usedByInvoices: false,
  }),
  view({}),
  view({
    id: 'v_old',
    rateBps: 1800,
    effectiveFrom: '2024-03-31T18:30:00.000Z',
    reviewStatus: 'reviewed',
    reviewedByName: 'Bose',
    reviewedAt: '2024-03-30T10:00:00.000Z',
    reason: 'Old hair rate',
    state: 'replaced',
  }),
  view({ id: 'v_facial', sacCode: '999722', reason: 'Provisional facial rate' }),
  view({ id: 'v_spa', sacCode: '999723', reason: 'Provisional spa rate' }),
  view({ id: 'v_other', sacCode: '999729', reason: 'Provisional other rate' }),
]

const SCREEN: TaxScreenData = {
  branchId: 'branch_rs',
  branchName: 'Rayasandra',
  issuer: { legalName: null, gstin: null, invoicePrefix: 'RS', prefixFixed: true },
  invoicingLive: false,
  versions: VERSIONS,
}

type Reply = { status: number; body: unknown }
type Call = { url: string; init: RequestInit | undefined }

let calls: Call[] = []
let screenData: TaxScreenData = SCREEN
let postReply: Reply = { status: 201, body: { success: true, data: { version: {} } } }

function reply({ status, body }: Reply): Response {
  return new Response(JSON.stringify(body), { status })
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
  screenData = SCREEN
  postReply = { status: 201, body: { success: true, data: { version: {} } } }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      if (init?.method === 'POST') {
        return reply(postReply)
      }
      if (init?.method === 'PATCH') {
        return reply({ status: 200, body: { success: true, data: { version: {} } } })
      }
      return reply({ status: 200, body: { success: true, data: screenData } })
    }),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

const sent = (method: string) => calls.filter((c) => c.init?.method === method)
const bodyOf = (call: Call | undefined) => JSON.parse(String(call?.init?.body ?? '{}'))
const loads = () => calls.filter((c) => !c.init?.method)

function rowOf(text: string): HTMLElement {
  const row = screen.getByText(text).closest('tr')
  if (!row) {
    throw new Error(`no row for ${text}`)
  }
  return row
}

describe('TaxManager', () => {
  it('lists the rates with their state and review, and says the branch can invoice', async () => {
    const { container } = render(<TaxManager />)

    expect(await screen.findByText('Provisional hair rate')).toBeInTheDocument()
    expect(within(rowOf('Provisional hair rate')).getByText('In Force')).toBeInTheDocument()
    expect(within(rowOf('Council revision')).getByText('Scheduled')).toBeInTheDocument()
    expect(within(rowOf('Council revision')).getByText('12%')).toBeInTheDocument()
    expect(within(rowOf('Old hair rate')).getByText('Replaced')).toBeInTheDocument()
    expect(within(rowOf('Old hair rate')).getByText('Bose · 30/03/2024')).toBeInTheDocument()
    expect(within(rowOf('Old hair rate')).getByText('Used by invoices')).toBeInTheDocument()
    expect(
      screen.getByText(`RS/${financialYearIST(new Date())}/000123`, { exact: false }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Test invoicing: invoices say their rates are provisional. Rayasandra can invoice.',
      ),
    ).toBeInTheDocument()
    expect(await axe(container)).toHaveNoViolations()
  })

  it('names what live invoicing still needs (TX-08)', async () => {
    screenData = { ...SCREEN, invoicingLive: true }
    render(<TaxManager />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Live invoicing. Rayasandra can't invoice yet: it needs its legal name, its GSTIN, reviewed rates.",
    )
  })

  it('names a SAC code with no rate in force, in either mode', async () => {
    screenData = { ...SCREEN, versions: VERSIONS.filter((v) => v.sacCode !== '999729') }
    render(<TaxManager />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Rayasandra can't invoice yet: it needs no rate in force for SAC 999729.",
    )
  })

  it('says a live branch with its issuer details and reviewed rates can invoice', async () => {
    screenData = {
      ...SCREEN,
      invoicingLive: true,
      issuer: {
        ...SCREEN.issuer,
        legalName: 'Royal Glow Salon and Spa LLP',
        gstin: '29ABCDE1234F1Z5',
      },
      versions: VERSIONS.map((v) => ({ ...v, reviewStatus: 'reviewed' as const })),
    }
    render(<TaxManager />)

    expect(await screen.findByText('Live invoicing. Rayasandra can invoice.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('adds a rate as basis points from the chosen date', async () => {
    render(<TaxManager />)
    await screen.findByText('Provisional hair rate')

    fireEvent.click(screen.getByRole('button', { name: '+ Add Rate' }))
    const panel = await screen.findByRole('dialog')
    fireEvent.keyDown(within(panel).getByRole('combobox', { name: 'SAC code' }), { key: 'Enter' })
    fireEvent.click(await screen.findByRole('option', { name: /999729/ }))
    fireEvent.change(within(panel).getByLabelText('GST rate (%)'), { target: { value: '12.5' } })
    fireEvent.change(within(panel).getByLabelText('Starts on'), {
      target: { value: '2026-11-15' },
    })
    fireEvent.change(within(panel).getByLabelText(/^Reason/), {
      target: { value: '  GST Council revision  ' },
    })
    fireEvent.click(within(panel).getByRole('button', { name: 'Add Rate' }))

    await waitFor(() => expect(sent('POST')).toHaveLength(1))
    expect(sent('POST')[0]?.url).toBe('/api/tax-versions')
    expect(bodyOf(sent('POST')[0])).toEqual({
      branchId: 'branch_rs',
      sacCode: '999729',
      rateBps: 1250,
      effectiveFrom: '2026-11-15',
      reason: 'GST Council revision',
    })
    await waitFor(() =>
      expect(toastMocks.success).toHaveBeenCalledWith('12.5% added for SAC 999729'),
    )
    await waitFor(() => expect(loads()).toHaveLength(2))
  })

  it('catches a bad rate or a missing reason before sending', async () => {
    render(<TaxManager />)
    await screen.findByText('Provisional hair rate')
    fireEvent.click(screen.getByRole('button', { name: '+ Add Rate' }))
    const panel = await screen.findByRole('dialog')

    fireEvent.change(within(panel).getByLabelText('GST rate (%)'), { target: { value: '29' } })
    fireEvent.click(within(panel).getByRole('button', { name: 'Add Rate' }))
    expect(await within(panel).findByText('Enter a rate from 0% to 28%.')).toBeInTheDocument()

    fireEvent.change(within(panel).getByLabelText('GST rate (%)'), { target: { value: '5' } })
    fireEvent.click(within(panel).getByRole('button', { name: 'Add Rate' }))
    expect(await within(panel).findByText('Say why the rate changes.')).toBeInTheDocument()

    expect(sent('POST')).toHaveLength(0)
  })

  it('keeps the server’s refusal in the panel, against its field', async () => {
    postReply = {
      status: 400,
      body: {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'A change of rate starts on a future date.',
          statusCode: 400,
          details: { effectiveFrom: ['Choose tomorrow or later'] },
        },
      },
    }
    render(<TaxManager />)
    await screen.findByText('Provisional hair rate')
    fireEvent.click(screen.getByRole('button', { name: '+ Add Rate' }))
    const panel = await screen.findByRole('dialog')
    fireEvent.change(within(panel).getByLabelText(/^Reason/), {
      target: { value: 'Revision' },
    })
    fireEvent.click(within(panel).getByRole('button', { name: 'Add Rate' }))

    expect(
      await within(panel).findByText('A change of rate starts on a future date.'),
    ).toHaveAttribute('role', 'alert')
    expect(within(panel).getByText('Choose tomorrow or later')).toBeInTheDocument()
    expect(toastMocks.error).toHaveBeenCalledWith(
      'Could not add rate',
      'A change of rate starts on a future date.',
    )
    expect(loads()).toHaveLength(1)
  })

  it('marks a provisional rate reviewed after confirming (TX-10)', async () => {
    render(<TaxManager />)
    await screen.findByText('Provisional hair rate')

    fireEvent.keyDown(
      within(rowOf('Provisional hair rate')).getByRole('button', { name: 'Row actions' }),
      { key: 'Enter' },
    )
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Mark reviewed' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Mark 5% for SAC 999721 reviewed?')).toBeInTheDocument()
    expect(sent('PATCH')).toHaveLength(0)

    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark Reviewed' }))

    await waitFor(() => expect(sent('PATCH')).toHaveLength(1))
    expect(sent('PATCH')[0]?.url).toBe('/api/tax-versions/v_now')
    expect(bodyOf(sent('PATCH')[0])).toEqual({ branchId: 'branch_rs', reviewed: true })
    await waitFor(() =>
      expect(toastMocks.success).toHaveBeenCalledWith('5% for SAC 999721 reviewed'),
    )
  })

  it('offers no action on a reviewed rate', async () => {
    render(<TaxManager />)
    await screen.findByText('Old hair rate')

    expect(within(rowOf('Old hair rate')).queryByRole('button', { name: 'Row actions' })).toBeNull()
  })
})

describe('percentToBps / ratePercentText', () => {
  it.each([
    ['5', 500],
    ['12.5', 1250],
    [' 18 ', 1800],
    ['0', 0],
    ['28', 2800],
    ['0.25', 25],
  ])('reads %s%% as %i basis points', (text, bps) => {
    expect(percentToBps(text)).toBe(bps)
  })

  it.each(['28.01', '5.555', '-1', '', 'five', '100'])('refuses %s', (text) => {
    expect(percentToBps(text)).toBeNull()
  })

  it('shows basis points as a percentage', () => {
    expect(ratePercentText(500)).toBe('5%')
    expect(ratePercentText(1250)).toBe('12.5%')
    expect(ratePercentText(0)).toBe('0%')
  })
})
