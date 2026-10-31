/************************************************************
 * Module Name  : SettingsForm (component test)
 * Scope        : Admin Portal — branch booking settings (multi-branch R1.1, R6.3)
 *
 * Description  : The Settings screen edits the active branch's settings as
 *                numbered revisions:
 *                - it names the branch, its current revision and who saved it,
 *                  and lists the recent history;
 *                - a section save sends the branch and the revision the page
 *                  holds, then holds the new revision for the next save;
 *                - a save refused because someone saved since (or the branch
 *                  was switched) offers a reload instead of a retry;
 *                - a section that can't be read says the branch isn't taking
 *                  bookings and starts from the standard values;
 *                - invoicing stays one switch for every branch.
 *                No accessibility violations on the loaded screen.
 *
 * Notes        : `fetch` is stubbed on the global; toasts are mocked. Radix
 *                needs a few DOM APIs jsdom omits, stubbed below.
 ************************************************************/

import type { BranchSettingsView } from '@rgss/types'
import {
  DEFAULT_BOOKING_RULES,
  DEFAULT_BUSINESS_HOURS,
  DEFAULT_INVOICING,
  DEFAULT_SETTLEMENT,
} from '@rgss/types'
import { cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }))
vi.mock('@/lib/admin/toast', () => ({ toast: toastMocks }))

import { revisionLine, SettingsForm, type SettingsScreenData } from './settings-form'

expect.extend(toHaveNoViolations)

function branchView(overrides: Partial<BranchSettingsView> = {}): BranchSettingsView {
  return {
    branchId: 'branch_rs',
    branchName: 'Rayasandra',
    revision: 3,
    savedAt: '2026-10-30T05:00:00.000Z',
    savedByName: 'Katabathuni Bose',
    businessHours: DEFAULT_BUSINESS_HOURS,
    bookingRules: DEFAULT_BOOKING_RULES,
    ...overrides,
  }
}

const HISTORY: SettingsScreenData['history'] = [
  {
    revision: 3,
    section: 'bookingRules',
    savedAt: '2026-10-30T05:00:00.000Z',
    savedByName: 'Katabathuni Bose',
  },
  {
    revision: 2,
    section: 'businessHours',
    savedAt: '2026-10-29T05:00:00.000Z',
    savedByName: 'Katabathuni Bose',
  },
  { revision: 1, section: null, savedAt: '2026-10-28T05:00:00.000Z', savedByName: null },
]

type Reply = { status: number; body: unknown }
type Call = { url: string; init: RequestInit | undefined }

let calls: Call[] = []
let screenData: SettingsScreenData
let putReplies: Reply[] = []

function reply({ status, body }: Reply): Response {
  return new Response(JSON.stringify(body), { status })
}

// A successful branch save: the next revision, as the route answers.
function savedReply(section: string, revision: number): Reply {
  return {
    status: 200,
    body: {
      success: true,
      data: {
        section,
        branch: branchView({ revision, savedAt: '2026-10-30T06:00:00.000Z' }),
        history: [
          {
            revision,
            section,
            savedAt: '2026-10-30T06:00:00.000Z',
            savedByName: 'Katabathuni Bose',
          },
          ...HISTORY,
        ],
      },
    },
  }
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
  screenData = {
    branch: branchView(),
    history: HISTORY,
    invoicing: DEFAULT_INVOICING,
    settlement: DEFAULT_SETTLEMENT,
  }
  putReplies = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      if (init?.method === 'PUT') {
        return reply(
          putReplies.shift() ?? {
            status: 200,
            body: { success: true, data: { section: 'invoicing', invoicing: { live: true } } },
          },
        )
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

const puts = () => calls.filter((c) => c.init?.method === 'PUT')
const bodyOf = (call: Call | undefined) => JSON.parse(String(call?.init?.body ?? '{}'))
const loads = () => calls.filter((c) => !c.init?.method)

function saveButtonIn(title: string): HTMLElement {
  const section = screen.getByRole('heading', { name: title }).closest('section')
  const save = Array.from(section?.querySelectorAll('button') ?? []).find(
    (b) => b.textContent === 'Save',
  )
  if (!save) {
    throw new Error(`no Save button in ${title}`)
  }
  return save
}

// The screen renders fourteen Radix time pickers, each collecting its 96
// options while closed; in jsdom that takes seconds, so the cases and their
// waits get room.
vi.setConfig({ testTimeout: 30_000 })
configure({ asyncUtilTimeout: 10_000 })

describe('SettingsForm', () => {
  it("shows the active branch's revision, who saved it and its history", async () => {
    const { container } = render(<SettingsForm />)

    expect(
      await screen.findByRole('heading', { name: 'Business hours at Rayasandra' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Booking rules at Rayasandra' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Invoicing (all branches)' })).toBeInTheDocument()
    expect(screen.getByTestId('settings-revision')).toHaveTextContent(
      /^Revision 3, saved 30\/10\/2026, .+ by Katabathuni Bose$/,
    )
    expect(screen.getByText(/All settings, set up/)).toBeInTheDocument()
    expect(screen.getAllByText(/^Revision \d$/)).toHaveLength(3)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('offers every booking rule, with the reschedule rules', async () => {
    render(<SettingsForm />)
    await screen.findByRole('heading', { name: 'Booking rules at Rayasandra' })

    for (const [label, value] of [
      ['Lead time (minutes)', 60],
      ['Booking window (days)', 30],
      ['Late cancellation within (hours)', 4],
      ['Upcoming bookings per customer', 3],
      ['Reschedule cut-off (hours)', 1],
      ['Reschedules per booking', 2],
    ] as const) {
      expect(screen.getByLabelText(label)).toHaveValue(value)
    }
  })

  it('saves a section from the revision it holds, then holds the new one', async () => {
    putReplies = [savedReply('businessHours', 4), savedReply('bookingRules', 5)]
    render(<SettingsForm />)
    await screen.findByRole('heading', { name: 'Business hours at Rayasandra' })

    fireEvent.click(screen.getByRole('checkbox', { name: 'Sunday closed' }))
    fireEvent.click(saveButtonIn('Business hours at Rayasandra'))

    await waitFor(() => expect(puts()).toHaveLength(1))
    expect(bodyOf(puts()[0])).toEqual({
      section: 'businessHours',
      branchId: 'branch_rs',
      expectedRevision: 3,
      value: { ...DEFAULT_BUSINESS_HOURS, sun: { open: null, close: null, closed: true } },
    })
    await waitFor(() =>
      expect(screen.getByTestId('settings-revision')).toHaveTextContent(/^Revision 4, saved/),
    )

    fireEvent.change(screen.getByLabelText('Reschedules per booking'), { target: { value: '1' } })
    fireEvent.click(saveButtonIn('Booking rules at Rayasandra'))

    await waitFor(() => expect(puts()).toHaveLength(2))
    expect(bodyOf(puts()[1])).toEqual({
      section: 'bookingRules',
      branchId: 'branch_rs',
      expectedRevision: 4,
      value: { ...DEFAULT_BOOKING_RULES, maxReschedulesPerBooking: 1 },
    })
  })

  it('offers a reload, not a retry, when someone saved since the page loaded', async () => {
    putReplies = [
      {
        status: 409,
        body: {
          success: false,
          error: {
            code: 'SETTINGS_CHANGED',
            message:
              "Someone saved Rayasandra's settings after you opened this page. Reload to see them, then make your change again.",
          },
        },
      },
    ]
    render(<SettingsForm />)
    await screen.findByRole('heading', { name: 'Booking rules at Rayasandra' })

    fireEvent.click(saveButtonIn('Booking rules at Rayasandra'))

    expect(
      await screen.findByText(/Someone saved Rayasandra's settings after you opened this page/),
    ).toBeInTheDocument()
    const reload = screen.getByRole('button', { name: 'Reload settings' })
    expect(loads()).toHaveLength(1)
    screenData = { ...screenData, branch: branchView({ revision: 4 }) }
    fireEvent.click(reload)
    await waitFor(() => expect(loads()).toHaveLength(2))
    await waitFor(() =>
      expect(screen.getByTestId('settings-revision')).toHaveTextContent(/^Revision 4, saved/),
    )
  })

  it("says when a section can't be read, and starts it from the standard values", async () => {
    screenData = { ...screenData, branch: branchView({ bookingRules: null }) }
    render(<SettingsForm />)
    await screen.findByRole('heading', { name: 'Booking rules at Rayasandra' })

    expect(
      screen.getByText(
        /Rayasandra's booking rules are missing or can't be read, so it isn't taking bookings/,
      ),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Lead time (minutes)')).toHaveValue(60)
    expect(
      screen.queryByText(/business hours are missing or can't be read/),
    ).not.toBeInTheDocument()
  })

  it('switches invoicing for every branch, with no branch revision', async () => {
    render(<SettingsForm />)
    await screen.findByRole('heading', { name: 'Invoicing (all branches)' })

    fireEvent.click(screen.getByRole('switch'))
    fireEvent.click(saveButtonIn('Invoicing (all branches)'))

    await waitFor(() => expect(puts()).toHaveLength(1))
    expect(bodyOf(puts()[0])).toEqual({ section: 'invoicing', value: { live: true } })
  })

  it('saves the settlement share and value per gem for every branch, in basis points and paise', async () => {
    render(<SettingsForm />)
    await screen.findByRole('heading', { name: 'Settlement between branches (all branches)' })

    expect(screen.getByLabelText('Share for the delivering branch (%)')).toHaveValue(100)
    expect(screen.getByLabelText('Value of one gem (₹)')).toHaveValue(1)
    fireEvent.change(screen.getByLabelText('Share for the delivering branch (%)'), {
      target: { value: '92.5' },
    })
    fireEvent.change(screen.getByLabelText('Value of one gem (₹)'), { target: { value: '1.5' } })
    fireEvent.click(saveButtonIn('Settlement between branches (all branches)'))

    await waitFor(() => expect(puts()).toHaveLength(1))
    expect(bodyOf(puts()[0])).toEqual({
      section: 'settlement',
      value: { shareBps: 9250, gemValuePaise: 150 },
    })
  })

  it('says when the settlement settings can’t be read, starting from the standard values', async () => {
    screenData = { ...screenData, settlement: null }
    render(<SettingsForm />)

    expect(
      await screen.findByText(/The saved settlement settings can't be read/),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Share for the delivering branch (%)')).toHaveValue(100)
  })

  it('writes the revision line for each case', () => {
    expect(revisionLine({ revision: 0, savedAt: null, savedByName: null })).toBe(
      'No settings saved yet.',
    )
    expect(
      revisionLine({ revision: 1, savedAt: '2026-10-28T05:00:00.000Z', savedByName: null }),
    ).toMatch(/^Revision 1, set up 28\/10\/2026/)
  })
})
