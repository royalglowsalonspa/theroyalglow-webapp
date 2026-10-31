/************************************************************
 * Module Name  : MembershipDetail (component test)
 * Scope        : Admin Portal — Record or book a membership session
 *
 * Description  : The session panel records a session now, or books one ahead
 *                for a date and a half-hour start (membership-scheduling.md):
 *                - recorded now, it asks who can do it from now, refuses
 *                  someone still with a customer and sends no date or time;
 *                - booked ahead, it asks who can do it at that time, refuses
 *                  someone not scheduled then (but not someone busy now),
 *                  holds the button until a time is chosen, and sends the
 *                  date and start with the rendered branch.
 *                No accessibility violations.
 *
 * Notes        : `fetch` is stubbed on the global; toasts are mocked. Radix
 *                needs a few DOM APIs jsdom omits, stubbed below.
 ************************************************************/

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }))
vi.mock('@/lib/admin/toast', () => ({ toast: toastMocks }))

import { MembershipDetail } from './membership-detail'

expect.extend(toHaveNoViolations)

const MEMBERSHIP = {
  id: 'mem_1',
  membershipNumber: 'RG-MEM-26-1-12345',
  customerId: 'cust_1',
  tierId: 'tier_1',
  tierNameSnapshot: 'Gold',
  totalHoursMinutes: 600,
  usedHoursMinutes: 60,
  reservedMinutes: 0,
  startsAt: '2026-10-01T00:00:00.000Z',
  expiresAt: '2099-12-31T18:29:59.999Z',
  status: 'active',
  notes: null,
  createdAt: '2026-10-01T05:00:00.000Z',
  customerName: 'Kavya',
  sellingBranch: { id: 'rs', name: 'Rayasandra' },
  sale: null,
  branchId: 'rs',
  customerEmail: 'kavya@example.com',
  tier: {
    id: 'tier_1',
    name: 'Gold',
    slug: 'gold',
    description: null,
    defaultHoursMinutes: 600,
    defaultPricePaise: 1_500_000,
    defaultValidityDays: 90,
    sacCode: '999723',
    isActive: true,
    displayOrder: 1,
  },
  canCancel: false,
  cancelRefusal: null,
  sessions: [],
}

const SERVICES = {
  categories: [
    { serviceType: 'spa', services: [{ id: 'svc_aroma', name: 'Aroma 60', durationMinutes: 60 }] },
  ],
}

// Lata is with a customer now; Ravi isn't scheduled at the time asked about.
const STAFF = [
  { id: 'st_asha', name: 'Asha', designation: 'therapist', busy: null },
  {
    id: 'st_lata',
    name: 'Lata',
    designation: 'therapist',
    busy: { reason: 'working', since: '14:10' },
  },
  { id: 'st_ravi', name: 'Ravi', designation: 'therapist', busy: { reason: 'off_schedule' } },
]

type Call = { url: string; init: RequestInit | undefined }
let calls: Call[] = []

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
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      if (url === '/api/services') {
        return ok(SERVICES)
      }
      if (url.startsWith('/api/staff')) {
        // A slot gets reasons; the plain list has none.
        const staff = url.includes('minutes=') ? STAFF : STAFF.map(({ busy: _b, ...s }) => s)
        return ok({ branchId: 'rs', staff })
      }
      if (url === '/api/memberships/mem_1/sessions') {
        return ok({ booking: { id: 'bk_9' }, invoice: null, remainingMinutes: 480 }, 201)
      }
      return ok(MEMBERSHIP)
    }),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

const staffReads = () => calls.filter((c) => c.url.startsWith('/api/staff')).map((c) => c.url)
const sessionPosts = () => calls.filter((c) => c.url === '/api/memberships/mem_1/sessions')
const bodyOf = (call: Call | undefined) => JSON.parse(String(call?.init?.body ?? '{}'))

async function openPanel() {
  render(<MembershipDetail membershipId="mem_1" />)
  fireEvent.click(await screen.findByRole('button', { name: 'Record Session' }))
  const panel = await screen.findByRole('dialog', { name: 'Record Membership Session' })
  fireEvent.click(await within(panel).findByRole('checkbox', { name: 'Aroma 60' }))
  return panel
}

async function pick(panel: HTMLElement, label: string, option: string) {
  fireEvent.keyDown(within(panel).getByRole('combobox', { name: label }), { key: 'Enter' })
  fireEvent.click(await screen.findByRole('option', { name: option }))
}

describe('MembershipDetail — record a session now', () => {
  it('asks who can do it from now and starts it with no date or time', async () => {
    const panel = await openPanel()

    await waitFor(() => expect(staffReads()).toContain('/api/staff?minutes=60&kind=spa'))
    fireEvent.keyDown(within(panel).getByRole('combobox', { name: 'Who is doing it' }), {
      key: 'Enter',
    })
    // Still with a customer: can't start now. Not scheduled: work now isn't refused.
    expect(
      await screen.findByRole('option', { name: /Lata \(therapist\) · With a customer/ }),
    ).toHaveAttribute('aria-disabled', 'true')
    expect(
      screen.getByRole('option', { name: 'Ravi (therapist) · Not scheduled then' }),
    ).not.toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(screen.getByRole('option', { name: 'Asha (therapist)' }))

    fireEvent.click(within(panel).getByRole('button', { name: 'Record Session' }))

    await waitFor(() => expect(sessionPosts()).toHaveLength(1))
    const body = bodyOf(sessionPosts()[0])
    expect(body).toMatchObject({
      branchId: 'rs',
      staffId: 'st_asha',
      services: [{ serviceId: 'svc_aroma', durationMinutes: 60 }],
    })
    expect(body).not.toHaveProperty('bookingDate')
    expect(body).not.toHaveProperty('startTime')
    expect(typeof body.idempotencyKey).toBe('string')
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith('Session started'))
  }, 20_000)
})

describe('MembershipDetail — book a session ahead', () => {
  it('asks who can do it then and books it for the date and start', async () => {
    const panel = await openPanel()

    fireEvent.click(within(panel).getByRole('radio', { name: 'Book ahead' }))
    const book = within(panel).getByRole('button', { name: 'Book Session' })
    // No time yet: everyone is listed, and nothing can be booked.
    expect(book).toBeDisabled()
    await waitFor(() => expect(staffReads()).toContain('/api/staff'))

    fireEvent.change(within(panel).getByLabelText('Date'), { target: { value: '2026-11-20' } })
    await pick(panel, 'Start time', '04:30 PM')
    await waitFor(() =>
      expect(staffReads()).toContain('/api/staff?minutes=60&kind=spa&date=2026-11-20&start=16:30'),
    )
    expect(await axe(panel)).toHaveNoViolations()

    fireEvent.keyDown(within(panel).getByRole('combobox', { name: 'Who is doing it' }), {
      key: 'Enter',
    })
    // Not scheduled then: refused. Busy now: they may be free then.
    expect(
      await screen.findByRole('option', { name: 'Ravi (therapist) · Not scheduled then' }),
    ).toHaveAttribute('aria-disabled', 'true')
    expect(
      screen.getByRole('option', { name: /Lata \(therapist\) · With a customer/ }),
    ).not.toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(screen.getByRole('option', { name: 'Asha (therapist)' }))

    expect(
      within(panel).getByText(/Book the session for 20\/11\/2026 at 04:30 PM/),
    ).toBeInTheDocument()
    fireEvent.click(within(panel).getByRole('button', { name: 'Book Session' }))

    await waitFor(() => expect(sessionPosts()).toHaveLength(1))
    expect(bodyOf(sessionPosts()[0])).toMatchObject({
      branchId: 'rs',
      staffId: 'st_asha',
      services: [{ serviceId: 'svc_aroma', durationMinutes: 60 }],
      bookingDate: '2026-11-20',
      startTime: '16:30',
    })
    await waitFor(() =>
      expect(toastMocks.success).toHaveBeenCalledWith('Session booked for 20/11/2026 at 04:30 PM'),
    )
  }, 20_000)

  it('keeps a refused booking on the panel', async () => {
    const panel = await openPanel()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, init })
        if (url.startsWith('/api/staff')) {
          return ok({ branchId: 'rs', staff: STAFF })
        }
        if (url === '/api/memberships/mem_1/sessions') {
          return new Response(
            JSON.stringify({
              success: false,
              error: {
                code: 'MEMBERSHIP_EXPIRED',
                message: 'This membership expires on 05/12/2026. Choose a time before then.',
                statusCode: 409,
              },
            }),
            { status: 409 },
          )
        }
        return ok(MEMBERSHIP)
      }),
    )

    fireEvent.click(within(panel).getByRole('radio', { name: 'Book ahead' }))
    fireEvent.change(within(panel).getByLabelText('Date'), { target: { value: '2026-12-20' } })
    await pick(panel, 'Start time', '11:00 AM')
    await pick(panel, 'Who is doing it', 'Asha (therapist)')
    fireEvent.click(within(panel).getByRole('button', { name: 'Book Session' }))

    expect(await within(panel).findByText(/Choose a time before then\./)).toBeInTheDocument()
    expect(toastMocks.error).toHaveBeenCalledWith(
      'Could not book session',
      'This membership expires on 05/12/2026. Choose a time before then.',
    )
    expect(toastMocks.success).not.toHaveBeenCalled()
  }, 20_000)
})
