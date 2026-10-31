/************************************************************
 * Module Name  : SettlementsManager (component test)
 * Scope        : Admin Portal — statements between branches (multi-branch R10)
 *
 * Description  : The list shows each closed statement's month, branches, net
 *                and payment, and the month still open as running totals. A
 *                statement opens with its entries and its CSV. Mark paid asks
 *                for the date and reference, offers an internal transfer only
 *                between one Owner's branches, and keeps a refusal in the
 *                panel. The Developer reverses an entry with a reason; an
 *                Owner gets no corrections. No accessibility violations.
 *
 * Notes        : `fetch` is stubbed on the global; toasts are mocked. Radix
 *                needs a few DOM APIs jsdom omits, stubbed below.
 ************************************************************/

import type {
  SettlementDetailView,
  SettlementEntryView,
  SettlementListView,
  SettlementStatementView,
} from '@rgss/types'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { todayISTDateString } from '@/lib/admin/memberships'

const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }))
vi.mock('@/lib/admin/toast', () => ({ toast: toastMocks }))

import {
  canReverse,
  entryKindText,
  monthLabel,
  netText,
  SettlementsManager,
} from './settlements-manager'

expect.extend(toHaveNoViolations)

/* ── Fixtures ──────────────────────────────────────────────────────────── */

const MH = { id: 'branch_mh', name: 'Marathahalli' }
const RS = { id: 'branch_rs', name: 'Rayasandra' }

function amounts(membershipPaise: number, gemsPaise: number) {
  return {
    membershipPaise,
    membershipValuePaise: membershipPaise,
    membershipGstSharePaise: 0,
    gemsPaise,
    totalPaise: membershipPaise + gemsPaise,
  }
}

function statement(overrides: Partial<SettlementStatementView> = {}): SettlementStatementView {
  return {
    id: 'stl_1',
    month: '2026-09',
    branchA: MH,
    branchB: RS,
    aOwesB: amounts(250000, 0),
    bOwesA: amounts(0, 1500),
    net: { payingBranch: MH, receivingBranch: RS, amountPaise: 248500 },
    entryCount: 3,
    closedAt: '2026-09-30T19:00:00.000Z',
    paid: null,
    canMarkPaid: true,
    sameOwner: false,
    ...overrides,
  }
}

const PAID_AUGUST = statement({
  id: 'stl_aug',
  month: '2026-08',
  paid: {
    paidOn: '2026-09-04',
    reference: 'UTR 9911',
    internalTransfer: true,
    recordedByName: 'Katabathuni Bose',
    recordedAt: '2026-09-04T06:00:00.000Z',
  },
  canMarkPaid: false,
  sameOwner: true,
})

function entry(overrides: Partial<SettlementEntryView>): SettlementEntryView {
  return {
    id: 'ste_x',
    kind: 'membership_session',
    reversedKind: null,
    month: '2026-09',
    recordedAt: '2026-09-14T06:30:00.000Z',
    owingBranch: MH,
    owedBranch: RS,
    membershipNumber: null,
    bookingNumber: null,
    minutes: null,
    gems: null,
    valuePaise: 0,
    gstSharePaise: 0,
    amountOwedPaise: 0,
    shareBps: 10000,
    gemValuePaise: null,
    reversesEntryId: null,
    note: null,
    reversedByEntryId: null,
    ...overrides,
  }
}

const SESSION = entry({
  id: 'ste_1',
  membershipNumber: 'RG-MEM-26-2-12345',
  bookingNumber: 'BK-RS-2609-S-11111-M',
  minutes: 60,
  valuePaise: 250000,
  amountOwedPaise: 250000,
})
const GEMS = entry({
  id: 'ste_2',
  kind: 'gems_redemption',
  owingBranch: RS,
  owedBranch: MH,
  bookingNumber: 'BK-MH-2609-H-22222',
  gems: 15,
  valuePaise: 1500,
  amountOwedPaise: 1500,
  gemValuePaise: 100,
  reversedByEntryId: 'ste_3',
})
const CORRECTION = entry({
  id: 'ste_3',
  kind: 'reversal',
  reversedKind: 'gems_redemption',
  owingBranch: RS,
  owedBranch: MH,
  gems: -15,
  valuePaise: -1500,
  amountOwedPaise: -1500,
  reversesEntryId: 'ste_2',
  note: 'Booking cancelled at the counter',
})

const OPEN_OCTOBER = {
  month: '2026-10',
  branchA: MH,
  branchB: RS,
  aOwesB: amounts(125000, 0),
  bOwesA: amounts(0, 0),
  net: { payingBranch: MH, receivingBranch: RS, amountPaise: 125000 },
  entryCount: 1,
}

/* ── fetch ─────────────────────────────────────────────────────────────── */

type Reply = { status: number; body: unknown }
type Call = { url: string; init: RequestInit | undefined }

let calls: Call[] = []
let listData: SettlementListView
let listReplies: Reply[] = []
let detailData: SettlementDetailView
let paidReply: Reply
let reverseReply: Reply

function reply({ status, body }: Reply): Response {
  return new Response(JSON.stringify(body), { status })
}

function ok(data: unknown): Reply {
  return { status: 200, body: { success: true, data } }
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
  listData = { statements: [statement(), PAID_AUGUST], open: [OPEN_OCTOBER], scope: 'all' }
  listReplies = []
  detailData = { statement: statement(), entries: [SESSION, GEMS, CORRECTION], canReverse: true }
  paidReply = ok({ statement: statement({ paid: PAID_AUGUST.paid, canMarkPaid: false }) })
  reverseReply = ok({ entryId: 'ste_rev', month: '2026-10' })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      if (init?.method === 'POST' && url.endsWith('/paid')) {
        return reply(paidReply)
      }
      if (init?.method === 'POST' && url.endsWith('/reverse')) {
        return reply(reverseReply)
      }
      if (url === '/api/settlements') {
        return reply(listReplies.shift() ?? ok(listData))
      }
      return reply(ok(detailData))
    }),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

const listCalls = () => calls.filter((c) => c.url === '/api/settlements')
const posts = (suffix: string) =>
  calls.filter((c) => c.init?.method === 'POST' && c.url.endsWith(suffix))
const bodyOf = (call: Call | undefined) => JSON.parse(String(call?.init?.body ?? '{}'))

async function rowFor(month: string) {
  const cell = await screen.findByText(month)
  const row = cell.closest('tr')
  if (!row) {
    throw new Error(`no row for ${month}`)
  }
  return row
}

async function openRowActions(month: string) {
  const row = await rowFor(month)
  fireEvent.keyDown(within(row).getByRole('button', { name: 'Row actions' }), { key: 'Enter' })
}

async function openStatement(month = 'September 2026') {
  const row = await rowFor(month)
  fireEvent.click(
    within(row).getByRole('button', { name: `${month}, Marathahalli and Rayasandra` }),
  )
  return screen.findByRole('dialog', { name: `Marathahalli and Rayasandra, ${month}` })
}

/* ── The list ──────────────────────────────────────────────────────────── */

describe('SettlementsManager — the list', () => {
  it('shows each statement with its net and payment, and the month still open', async () => {
    const { container } = render(<SettlementsManager />)

    const september = await rowFor('September 2026')
    expect(within(september).getByText('Marathahalli · Rayasandra')).toBeInTheDocument()
    expect(
      within(september).getByText('Marathahalli pays Rayasandra ₹2,485.00'),
    ).toBeInTheDocument()
    expect(within(september).getByText('Unpaid')).toBeInTheDocument()

    const august = await rowFor('August 2026')
    expect(within(august).getByText('Paid')).toBeInTheDocument()
    expect(within(august).getByText('04/09/2026 · internal transfer')).toBeInTheDocument()

    const open = screen.getByRole('region', { name: 'This month so far' })
    expect(within(open).getByText('October 2026 · 1 entry')).toBeInTheDocument()
    expect(within(open).getByText('Marathahalli pays Rayasandra ₹1,250.00')).toBeInTheDocument()

    expect(await axe(container)).toHaveNoViolations()
  })

  it('says when no month has closed into a statement yet', async () => {
    listData = { statements: [], open: [], scope: 'owner' }
    render(<SettlementsManager />)

    expect(await screen.findByText('No statements yet')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'This month so far' })).toBeNull()
  })

  it('shows why the list failed, and loads it again on retry', async () => {
    listReplies = [
      {
        status: 404,
        body: {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Not found.', statusCode: 404 },
        },
      },
    ]
    render(<SettlementsManager />)

    expect(await screen.findByText('Not found.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('September 2026')).toBeInTheDocument()
    expect(listCalls()).toHaveLength(2)
  })

  it('offers Mark paid only on a statement the viewer may mark', async () => {
    render(<SettlementsManager />)

    await openRowActions('August 2026')
    expect(await screen.findByRole('menuitem', { name: 'View' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Download CSV' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Mark paid' })).toBeNull()
  })
})

/* ── A statement ───────────────────────────────────────────────────────── */

describe('SettlementsManager — a statement', () => {
  it('opens with what each branch owes, its entries and the CSV download', async () => {
    render(<SettlementsManager />)

    const dialog = await openStatement()

    expect(calls.some((c) => c.url === '/api/settlements/stl_1')).toBe(true)
    expect(within(dialog).getByTestId('statement-net')).toHaveTextContent(
      'Marathahalli pays Rayasandra ₹2,485.00',
    )
    expect(within(dialog).getByText('Marathahalli owes Rayasandra')).toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: 'Download CSV' })).toHaveAttribute(
      'href',
      '/api/settlements/stl_1?format=csv',
    )

    const table = await within(dialog).findByRole('table', { name: "The statement's entries" })
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(3)
    const [session, gems, correction] = rows as [HTMLElement, HTMLElement, HTMLElement]
    expect(within(session).getByText('Membership session')).toBeInTheDocument()
    expect(
      within(session).getByText('RG-MEM-26-2-12345 · BK-RS-2609-S-11111-M · 60 min'),
    ).toBeInTheDocument()
    expect(within(gems).getByText('BK-MH-2609-H-22222 · 15 gems')).toBeInTheDocument()
    expect(within(correction).getByText('Correction (gems)')).toBeInTheDocument()
    expect(within(correction).getByText('Booking cancelled at the counter')).toBeInTheDocument()
    // Its value and the amount owed, both negated.
    expect(within(correction).getAllByText('-₹15.00')).toHaveLength(2)

    // The Developer reverses what can still be reversed.
    expect(within(session).getByRole('button', { name: 'Reverse' })).toBeInTheDocument()
    expect(within(gems).getByText('Reversed')).toBeInTheDocument()
    expect(within(gems).queryByRole('button', { name: 'Reverse' })).toBeNull()
    expect(within(correction).queryByRole('button', { name: 'Reverse' })).toBeNull()
  })

  it('gives an Owner no corrections', async () => {
    detailData = { ...detailData, canReverse: false }
    render(<SettlementsManager />)

    const dialog = await openStatement()
    await within(dialog).findByRole('table', { name: "The statement's entries" })

    expect(within(dialog).queryByRole('button', { name: 'Reverse' })).toBeNull()
    expect(within(dialog).queryByText('Actions')).toBeNull()
  })

  it('shows the payment once recorded', async () => {
    detailData = { ...detailData, statement: PAID_AUGUST }
    render(<SettlementsManager />)

    const dialog = await openStatement('August 2026')

    expect(
      await within(dialog).findByText(/04\/09\/2026 · UTR 9911 · internal transfer/),
    ).toBeInTheDocument()
    expect(within(dialog).getByText(/Recorded by Katabathuni Bose/)).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Mark paid' })).toBeNull()
  })
})

/* ── Mark paid ─────────────────────────────────────────────────────────── */

describe('SettlementsManager — mark paid', () => {
  async function openMarkPaid() {
    await openRowActions('September 2026')
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Mark paid' }))
    return screen.findByRole('dialog', { name: 'Mark September 2026 paid' })
  }

  it('records the date and reference, then loads the list again', async () => {
    render(<SettlementsManager />)
    const dialog = await openMarkPaid()

    expect(within(dialog).getByText('Marathahalli pays Rayasandra ₹2,485.00')).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/Paid on/)).toHaveValue(todayISTDateString())
    // One Owner doesn't own both branches: no internal transfer.
    expect(within(dialog).queryByRole('checkbox', { name: 'Internal transfer' })).toBeNull()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark Paid' }))
    expect(
      await within(dialog).findByText('Enter the payment reference, such as the UTR.'),
    ).toBeInTheDocument()
    expect(posts('/paid')).toHaveLength(0)

    fireEvent.change(within(dialog).getByLabelText(/Payment reference/), {
      target: { value: '  UTR 4471  ' },
    })
    fireEvent.change(within(dialog).getByLabelText(/Paid on/), {
      target: { value: '2026-10-05' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark Paid' }))

    await waitFor(() => expect(posts('/paid')).toHaveLength(1))
    const [post] = posts('/paid')
    expect(post?.url).toBe('/api/settlements/stl_1/paid')
    expect(bodyOf(post)).toEqual({
      paidOn: '2026-10-05',
      reference: 'UTR 4471',
      internalTransfer: false,
    })
    await waitFor(() =>
      expect(toastMocks.success).toHaveBeenCalledWith('September 2026 statement marked paid'),
    )
    await waitFor(() => expect(listCalls()).toHaveLength(2))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it("offers an internal transfer between one Owner's branches", async () => {
    listData = { ...listData, statements: [statement({ sameOwner: true })] }
    render(<SettlementsManager />)
    const dialog = await openMarkPaid()

    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Internal transfer' }))
    fireEvent.change(within(dialog).getByLabelText(/Payment reference/), {
      target: { value: 'Own account transfer' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark Paid' }))

    await waitFor(() => expect(posts('/paid')).toHaveLength(1))
    expect(bodyOf(posts('/paid')[0])).toMatchObject({ internalTransfer: true })
  })

  it('keeps a refused payment in the panel, with the reason', async () => {
    paidReply = {
      status: 403,
      body: {
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: "Only Marathahalli's Owner or the Developer can mark this statement paid.",
          statusCode: 403,
        },
      },
    }
    render(<SettlementsManager />)
    const dialog = await openMarkPaid()

    fireEvent.change(within(dialog).getByLabelText(/Payment reference/), {
      target: { value: 'UTR 4471' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark Paid' }))

    expect(await within(dialog).findByText(/Only Marathahalli's Owner/)).toBeInTheDocument()
    expect(toastMocks.error).toHaveBeenCalledWith(
      'Could not record the payment',
      expect.stringContaining("Only Marathahalli's Owner"),
    )
    expect(toastMocks.success).not.toHaveBeenCalled()
    expect(listCalls()).toHaveLength(1)
  })

  it('shows the server’s field errors against the field', async () => {
    paidReply = {
      status: 400,
      body: {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: "The payment date can't be in the future.",
          statusCode: 400,
          details: { paidOn: ['Pick today or an earlier date.'] },
        },
      },
    }
    render(<SettlementsManager />)
    const dialog = await openMarkPaid()

    fireEvent.change(within(dialog).getByLabelText(/Payment reference/), {
      target: { value: 'UTR 4471' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark Paid' }))

    expect(await within(dialog).findByText('Pick today or an earlier date.')).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/Paid on/)).toHaveAttribute('aria-invalid', 'true')
  })

  it('opens from the statement too', async () => {
    render(<SettlementsManager />)
    const statementDialog = await openStatement()

    fireEvent.click(within(statementDialog).getByRole('button', { name: 'Mark paid' }))

    expect(
      await screen.findByRole('dialog', { name: 'Mark September 2026 paid' }),
    ).toBeInTheDocument()
  })
})

/* ── Reverse an entry ──────────────────────────────────────────────────── */

describe('SettlementsManager — reverse an entry', () => {
  it('asks for a reason, records the reversal and loads the list again', async () => {
    render(<SettlementsManager />)
    const statementDialog = await openStatement()
    const table = await within(statementDialog).findByRole('table', {
      name: "The statement's entries",
    })

    fireEvent.click(within(table).getByRole('button', { name: 'Reverse' }))
    const dialog = await screen.findByRole('dialog', { name: 'Reverse this entry' })
    expect(
      within(dialog).getByText('Membership session: Marathahalli owes Rayasandra ₹2,500.00'),
    ).toBeInTheDocument()

    fireEvent.change(within(dialog).getByLabelText(/Reason/), { target: { value: 'no' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reverse Entry' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Say why this entry is being reversed.',
    )
    expect(posts('/reverse')).toHaveLength(0)

    fireEvent.change(within(dialog).getByLabelText(/Reason/), {
      target: { value: 'The session was complimentary' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reverse Entry' }))

    await waitFor(() => expect(posts('/reverse')).toHaveLength(1))
    const [post] = posts('/reverse')
    expect(post?.url).toBe('/api/settlements/entries/ste_1/reverse')
    expect(bodyOf(post)).toEqual({ note: 'The session was complimentary' })
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith('Reversed in October 2026'))
    await waitFor(() => expect(listCalls()).toHaveLength(2))
  })

  it('keeps a refused reversal in the panel', async () => {
    reverseReply = {
      status: 409,
      body: {
        success: false,
        error: {
          code: 'CONFLICT',
          message: 'This entry has already been reversed.',
          statusCode: 409,
        },
      },
    }
    render(<SettlementsManager />)
    const statementDialog = await openStatement()
    const table = await within(statementDialog).findByRole('table', {
      name: "The statement's entries",
    })

    fireEvent.click(within(table).getByRole('button', { name: 'Reverse' }))
    const dialog = await screen.findByRole('dialog', { name: 'Reverse this entry' })
    fireEvent.change(within(dialog).getByLabelText(/Reason/), {
      target: { value: 'Recorded twice' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reverse Entry' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'This entry has already been reversed.',
    )
    expect(listCalls()).toHaveLength(1)
  })
})

/* ── Helpers ───────────────────────────────────────────────────────────── */

describe('settlements helpers', () => {
  it('names a month', () => {
    expect(monthLabel('2026-11')).toBe('November 2026')
    expect(monthLabel('2027-01')).toBe('January 2027')
    expect(monthLabel('2026-13')).toBe('2026-13')
  })

  it('says who pays whom, or that nothing is owed', () => {
    expect(netText({ payingBranch: RS, receivingBranch: MH, amountPaise: 97619 })).toBe(
      'Rayasandra pays Marathahalli ₹976.19',
    )
    expect(netText({ payingBranch: null, receivingBranch: null, amountPaise: 0 })).toBe(
      'Nothing to pay',
    )
  })

  it('names what an entry is, and what a correction corrects', () => {
    expect(entryKindText(SESSION)).toBe('Membership session')
    expect(entryKindText(GEMS)).toBe('Gems')
    expect(entryKindText(CORRECTION)).toBe('Correction (gems)')
    expect(entryKindText({ ...CORRECTION, reversedKind: 'membership_session' })).toBe(
      'Correction (membership session)',
    )
  })

  it('reverses an entry between two branches at most once, and never a correction', () => {
    expect(canReverse(SESSION)).toBe(true)
    expect(canReverse(GEMS)).toBe(false)
    expect(canReverse(CORRECTION)).toBe(false)
    expect(canReverse({ ...SESSION, owedBranch: MH })).toBe(false)
  })
})
