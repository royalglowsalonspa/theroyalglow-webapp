/************************************************************
 * Module Name  : BookingDetail (component test)
 * Scope        : Admin Portal — Booking detail (multi-branch R1.7)
 *
 * Description  : A confirmed booking whose assignee was taken off it says
 *                why, shows nobody assigned and holds checkout until
 *                reception assigns someone, with the rendered branch. An
 *                assigned booking names its staff and offers a change only
 *                once someone else is picked. The salon moves a pending or
 *                confirmed booking (half-hour starts, a warning when it now
 *                needs someone) and cancels a confirmed one with a reason
 *                (slice 3). No accessibility violations.
 *
 * Notes        : `fetch` is stubbed on the global; toasts are mocked. Radix
 *                needs a few DOM APIs jsdom omits, stubbed below.
 ************************************************************/

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }))
vi.mock('@/lib/admin/toast', () => ({ toast: toastMocks }))

import { BookingDetail } from './booking-detail'

expect.extend(toHaveNoViolations)

const STAFF = [
  { id: 'st_asha', name: 'Asha', designation: 'stylist' },
  { id: 'st_ravi', name: 'Ravi', designation: 'stylist' },
]

const booking = (overrides: Record<string, unknown> = {}) => ({
  id: 'bk_1',
  branchId: 'rs',
  bookingNumber: 'BK-RS-2611-H-12345',
  status: 'confirmed',
  serviceType: 'salon',
  bookingDate: '2026-11-05',
  startTime: '15:00',
  endTime: '16:00',
  totalAmountPaise: 150_000,
  customerName: 'Kavya',
  customerEmail: 'kavya@example.com',
  notes: null,
  services: [
    {
      id: 'bs_1',
      serviceNameSnapshot: 'Haircut',
      priceAtBookingPaise: 150_000,
      durationMinutes: 60,
      staffId: 'st_asha',
      staffName: 'Asha',
    },
  ],
  reassignment: null,
  ...overrides,
})

const UNASSIGNED = booking({
  services: [
    {
      id: 'bs_1',
      serviceNameSnapshot: 'Haircut',
      priceAtBookingPaise: 150_000,
      durationMinutes: 60,
      staffId: null,
      staffName: null,
    },
  ],
  reassignment: {
    reason: 'left_branch',
    previousStaffName: 'Meena',
    since: '2026-11-01T10:00:00.000Z',
  },
})

type Call = { url: string; init: RequestInit | undefined }
let calls: Call[] = []
let current: ReturnType<typeof booking> = booking()

function ok(data: unknown): Response {
  return new Response(JSON.stringify({ success: true, data }), { status: 200 })
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
  // 11:30 IST on 05/11/2026, the fixtures' day: their bookings are today's.
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-05T06:00:00.000Z') })
  calls = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      if (url.startsWith('/api/staff')) {
        return ok({ branchId: 'rs', staff: STAFF })
      }
      if (init?.method === 'PATCH') {
        return ok({ bookingId: 'bk_1', services: [] })
      }
      return ok({ booking: current })
    }),
  )
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

const patches = () => calls.filter((c) => c.init?.method === 'PATCH')
const reads = () => calls.filter((c) => c.url === '/api/bookings/bk_1' && !c.init?.method)

async function pick(label: string, option: string) {
  fireEvent.keyDown(await screen.findByRole('combobox', { name: label }), { key: 'Enter' })
  fireEvent.click(await screen.findByRole('option', { name: option }))
}

describe('BookingDetail — reassignment (R1.7)', () => {
  it('says why it needs someone else and holds checkout until someone is assigned', async () => {
    current = UNASSIGNED
    const { container } = render(<BookingDetail bookingId="bk_1" />)

    expect(
      await screen.findByRole('heading', { name: 'This booking needs someone else' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/Meena no longer works at this branch\./)).toBeInTheDocument()
    expect(screen.getByText('Not assigned')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Complete & Checkout' })).toBeDisabled()
    expect(
      screen.getByText('Assign who is doing this booking before completing it.'),
    ).toBeInTheDocument()
    expect(await axe(container)).toHaveNoViolations()

    await pick('Assign staff', 'Ravi (stylist)')
    fireEvent.click(screen.getByRole('button', { name: 'Assign' }))

    await waitFor(() => expect(patches()).toHaveLength(1))
    const [patch] = patches()
    expect(patch?.url).toBe('/api/bookings/bk_1')
    expect(JSON.parse(String(patch?.init?.body ?? '{}'))).toEqual({
      action: 'assign',
      branchId: 'rs',
      staffId: 'st_ravi',
    })
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith('Ravi assigned'))
    // Reloaded to show the new assignee.
    await waitFor(() => expect(reads()).toHaveLength(2))
    // The axe scan of the full detail page alone takes seconds when the whole
    // suite runs in parallel; the default 5 s timeout made this flaky.
  }, 20_000)

  it('names the assignee and offers a change only for someone else', async () => {
    current = booking()
    render(<BookingDetail bookingId="bk_1" />)

    expect(await screen.findByText('Asha')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'This booking needs someone else' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Complete & Checkout' })).toBeEnabled()
    const change = screen.getByRole('button', { name: 'Change staff' })
    expect(change).toBeDisabled()

    await pick('Assigned staff', 'Ravi (stylist)')
    expect(change).toBeEnabled()
  })

  it('asks about its own slot, and refuses only who the database would (slice 2b)', async () => {
    current = booking()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, init })
        if (url.startsWith('/api/staff')) {
          return ok({
            branchId: 'rs',
            staff: [
              { id: 'st_asha', name: 'Asha', designation: 'stylist', busy: null },
              {
                id: 'st_ravi',
                name: 'Ravi',
                designation: 'stylist',
                busy: { reason: 'booked', from: '14:30', to: '15:30' },
              },
              {
                id: 'st_meena',
                name: 'Meena',
                designation: 'stylist',
                busy: { reason: 'on_leave' },
              },
              {
                id: 'st_lata',
                name: 'Lata',
                designation: 'stylist',
                busy: { reason: 'working', since: '14:10' },
              },
            ],
          })
        }
        return ok({ booking: current })
      }),
    )
    render(<BookingDetail bookingId="bk_1" />)

    fireEvent.keyDown(await screen.findByRole('combobox', { name: 'Assigned staff' }), {
      key: 'Enter',
    })
    expect(calls.map((c) => c.url)).toContain('/api/staff?booking=bk_1')
    const booked = await screen.findByRole('option', {
      name: 'Ravi (stylist) · Booked 02:30 PM–03:30 PM',
    })
    expect(booked).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('option', { name: 'Meena (stylist) · On leave' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    // Still with a customer now: reception may assign them and wait, because
    // the booking hasn't started.
    const working = screen.getByRole('option', {
      name: 'Lata (stylist) · With a customer since 02:10 PM',
    })
    expect(working).not.toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(working)
    expect(screen.getByRole('button', { name: 'Change staff' })).toBeEnabled()
  })

  it('says a booking is held up while its person is still with another customer', async () => {
    current = booking({
      reassignment: {
        reason: 'overrun',
        previousStaffName: 'Asha',
        heldUp: true,
        since: '2026-11-05T09:40:00.000Z',
      },
    })
    render(<BookingDetail bookingId="bk_1" />)

    expect(
      await screen.findByRole('heading', { name: 'This booking is held up' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        /Asha is still with another customer, so this booking can’t start yet\. Start it once they’re free, or assign someone else under Actions\./,
      ),
    ).toBeInTheDocument()
    // The person stays assigned.
    expect(screen.getByRole('button', { name: 'Change staff' })).toBeDisabled()
  })

  it('keeps a refused assignment on the page', async () => {
    current = UNASSIGNED
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, init })
        if (url.startsWith('/api/staff')) {
          return ok({ branchId: 'rs', staff: STAFF })
        }
        if (init?.method === 'PATCH') {
          return new Response(
            JSON.stringify({
              success: false,
              error: {
                code: 'CONFLICT',
                message: 'That staff member is on approved leave that day. Choose someone else.',
                statusCode: 409,
              },
            }),
            { status: 409 },
          )
        }
        return ok({ booking: current })
      }),
    )
    render(<BookingDetail bookingId="bk_1" />)

    await pick('Assign staff', 'Ravi (stylist)')
    fireEvent.click(screen.getByRole('button', { name: 'Assign' }))

    expect(await screen.findByText(/on approved leave that day/)).toBeInTheDocument()
    expect(toastMocks.success).not.toHaveBeenCalled()
    expect(reads()).toHaveLength(1)
  })
})

// --- Start and completion (membership-scheduling.md) ---

const SESSION = booking({
  bookingNumber: 'BK-RS-2611-S-12345-M',
  serviceType: 'spa',
  totalAmountPaise: 0,
  totalDurationMinutes: 90,
  isMembershipSession: true,
  spaMembershipId: 'mem_1',
  services: [
    {
      id: 'bs_1',
      serviceNameSnapshot: 'Aroma 90',
      priceAtBookingPaise: 0,
      durationMinutes: 90,
      staffId: 'st_asha',
      staffName: 'Asha',
    },
  ],
})

/** Answers the booking's actions; every other read returns `current`. */
function stubActions(replies: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      if (url.startsWith('/api/staff')) {
        return ok({ branchId: 'rs', staff: STAFF })
      }
      const action = url.match(/^\/api\/bookings\/bk_1\/(\w+)$/)?.[1]
      if (action && init?.method === 'POST') {
        return ok(replies[action] ?? {})
      }
      return ok({ booking: current })
    }),
  )
}

const posts = (action: string) =>
  calls.filter((c) => c.url === `/api/bookings/bk_1/${action}` && c.init?.method === 'POST')

const bodyOf = (call: Call | undefined) => JSON.parse(String(call?.init?.body ?? '{}'))

describe('BookingDetail — a membership session starts, then completes', () => {
  it('offers Start Session, not checkout, for a confirmed session', async () => {
    current = SESSION
    stubActions({ start: { booking: { ...SESSION, status: 'in_progress' } } })
    const { container } = render(<BookingDetail bookingId="bk_1" />)

    const startButton = await screen.findByRole('button', { name: 'Start Session' })
    expect(screen.queryByRole('button', { name: 'Complete & Checkout' })).toBeNull()
    expect(screen.getByText('SPA membership hours')).toBeInTheDocument()
    expect(await axe(container)).toHaveNoViolations()

    fireEvent.click(startButton)

    await waitFor(() => expect(posts('start')).toHaveLength(1))
    expect(bodyOf(posts('start')[0])).toEqual({ branchId: 'rs' })
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith('Session started'))
    // Reloaded to show it in progress.
    await waitFor(() => expect(reads()).toHaveLength(2))
  }, 20_000)

  it('holds the start until someone is assigned', async () => {
    current = booking({ ...SESSION, services: UNASSIGNED.services })
    render(<BookingDetail bookingId="bk_1" />)

    expect(await screen.findByRole('button', { name: 'Start Session' })).toBeDisabled()
    expect(
      screen.getByText('Assign who is doing this session before starting it.'),
    ).toBeInTheDocument()
  })

  it('completes a session in progress without asking for payment', async () => {
    current = booking({
      ...SESSION,
      status: 'in_progress',
      startedAt: '2026-11-05T09:35:00.000Z',
    })
    stubActions({
      complete: {
        booking: { ...SESSION, status: 'completed' },
        invoice: { invoiceNumber: 'RS/2627/000042', totalPaise: 0, gstPaise: 0 },
        gemsEarned: 0,
        remainingMinutes: 510,
      },
    })
    const { container } = render(<BookingDetail bookingId="bk_1" />)

    // Started at 15:05 IST.
    expect(await screen.findByText(/started 05\/11\/2026, 15:05/)).toBeInTheDocument()
    expect(screen.queryByRole('radiogroup', { name: 'Payment method' })).toBeNull()
    expect(screen.getByText(/Uses 1h 30m of the membership/)).toBeInTheDocument()
    expect(await axe(container)).toHaveNoViolations()

    // The page reloads as completed once it's done.
    current = booking({ ...SESSION, status: 'completed' })
    fireEvent.click(screen.getByRole('button', { name: 'Complete Session' }))

    await waitFor(() => expect(posts('complete')).toHaveLength(1))
    // No payment method: the membership paid for the minutes.
    expect(bodyOf(posts('complete')[0])).toEqual({ branchId: 'rs' })
    await waitFor(() =>
      expect(toastMocks.success).toHaveBeenCalledWith('Session completed · invoice RS/2627/000042'),
    )
    expect(await screen.findByText('Session completed')).toBeInTheDocument()
    expect(screen.getByText('8h 30m left on the membership')).toBeInTheDocument()
    expect(screen.queryByText(/gems awarded/)).toBeNull()
  }, 20_000)

  it('keeps a refused completion on the page', async () => {
    current = booking({ ...SESSION, status: 'in_progress' })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, init })
        if (init?.method === 'POST') {
          return new Response(
            JSON.stringify({
              success: false,
              error: {
                code: 'BOOKING_INVALID_STATUS_TRANSITION',
                message:
                  'This session was completed or changed meanwhile. Reload it to see where it stands.',
                statusCode: 409,
              },
            }),
            { status: 409 },
          )
        }
        return ok({ booking: current })
      }),
    )
    render(<BookingDetail bookingId="bk_1" />)

    fireEvent.click(await screen.findByRole('button', { name: 'Complete Session' }))

    expect(await screen.findByText(/completed or changed meanwhile/)).toBeInTheDocument()
    expect(toastMocks.error).toHaveBeenCalledWith(
      'Could not complete session',
      'This session was completed or changed meanwhile. Reload it to see where it stands.',
    )
    expect(reads()).toHaveLength(1)
  })
})

describe('BookingDetail — an ordinary booking may start before checkout', () => {
  it('starts a confirmed booking on request', async () => {
    current = booking()
    stubActions({ start: { booking: { ...current, status: 'in_progress' } } })
    render(<BookingDetail bookingId="bk_1" />)

    fireEvent.click(await screen.findByRole('button', { name: 'Start Service' }))

    await waitFor(() => expect(posts('start')).toHaveLength(1))
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith('Booking started'))
  })

  it('checks out a booking in progress with the payment method', async () => {
    current = booking({ status: 'in_progress', startedAt: '2026-11-05T09:30:00.000Z' })
    stubActions({
      complete: {
        booking: { ...current, status: 'completed' },
        invoice: { invoiceNumber: 'RS/2627/000043', totalPaise: 150_000, gstPaise: 7143 },
        gemsEarned: 15,
      },
    })
    render(<BookingDetail bookingId="bk_1" />)

    fireEvent.click(await screen.findByRole('button', { name: 'Complete & Checkout' }))
    fireEvent.click(screen.getByRole('radio', { name: 'UPI' }))
    current = booking({ status: 'completed' })
    fireEvent.click(screen.getByRole('button', { name: 'Complete & Generate Invoice' }))

    await waitFor(() => expect(posts('complete')).toHaveLength(1))
    expect(bodyOf(posts('complete')[0])).toEqual({ branchId: 'rs', paymentMethod: 'upi' })
    expect(await screen.findByText('Booking completed')).toBeInTheDocument()
    expect(screen.getByText('+15 gems awarded')).toBeInTheDocument()
  })

  it('holds the start of a booking for a later day, saying to move it first', async () => {
    current = booking({ bookingDate: '2026-11-06' })
    render(<BookingDetail bookingId="bk_1" />)

    expect(await screen.findByRole('button', { name: 'Start Service' })).toBeDisabled()
    expect(
      screen.getByText('It starts on 06/11/2026. To start it now, move it to today.'),
    ).toBeInTheDocument()
    // It can still be moved, or checked out.
    expect(screen.getByRole('button', { name: 'Move booking' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Complete & Checkout' })).toBeEnabled()
  })

  it('offers no no-show once a booking has started', async () => {
    current = booking({ status: 'in_progress' })
    render(<BookingDetail bookingId="bk_1" />)

    expect(await screen.findByRole('button', { name: 'Complete & Checkout' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Mark No-Show' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Start Service' })).toBeNull()
  })
})

// --- The salon moves or cancels a booking (membership-scheduling.md slice 3) ---

describe('BookingDetail — the salon moves or cancels a booking', () => {
  it('moves a confirmed booking with the rendered branch, and says when it needs someone', async () => {
    current = booking()
    stubActions({ reschedule: { booking: current, needsStaff: true } })
    const { container } = render(<BookingDetail bookingId="bk_1" />)

    fireEvent.click(await screen.findByRole('button', { name: 'Move booking' }))
    const move = screen.getByRole('button', { name: 'Move Booking' })
    // Nothing to move until the date or time changes.
    expect(move).toBeDisabled()
    expect(await axe(container)).toHaveNoViolations()

    fireEvent.change(screen.getByLabelText('New date'), { target: { value: '2026-11-07' } })
    await pick('New start time', '11:30 AM')
    // Only the booking grid's half hours are offered.
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'New start time' }), { key: 'Enter' })
    expect(screen.queryByRole('option', { name: '11:15 AM' })).toBeNull()
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    fireEvent.click(move)

    await waitFor(() => expect(posts('reschedule')).toHaveLength(1))
    expect(bodyOf(posts('reschedule')[0])).toEqual({
      branchId: 'rs',
      bookingDate: '2026-11-07',
      startTime: '11:30',
    })
    await waitFor(() =>
      expect(toastMocks.success).toHaveBeenCalledWith('Booking moved to 07/11/2026 at 11:30 AM'),
    )
    expect(toastMocks.warning).toHaveBeenCalledWith(
      'Its staff member can’t take the new time. Assign someone else.',
    )
    await waitFor(() => expect(reads()).toHaveLength(2))
  }, 20_000)

  it('keeps a refused move on the page', async () => {
    current = booking()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, init })
        if (url.startsWith('/api/staff')) {
          return ok({ branchId: 'rs', staff: STAFF })
        }
        if (init?.method === 'POST') {
          return new Response(
            JSON.stringify({
              success: false,
              error: {
                code: 'BOOKING_SLOT_UNAVAILABLE',
                message: 'Rayasandra is closed on 08/11/2026 (Diwali).',
                statusCode: 409,
              },
            }),
            { status: 409 },
          )
        }
        return ok({ booking: current })
      }),
    )
    render(<BookingDetail bookingId="bk_1" />)

    fireEvent.click(await screen.findByRole('button', { name: 'Move booking' }))
    fireEvent.change(screen.getByLabelText('New date'), { target: { value: '2026-11-08' } })
    fireEvent.click(screen.getByRole('button', { name: 'Move Booking' }))

    expect(await screen.findByText(/closed on 08\/11\/2026 \(Diwali\)/)).toBeInTheDocument()
    expect(toastMocks.error).toHaveBeenCalledWith(
      'Could not move booking',
      'Rayasandra is closed on 08/11/2026 (Diwali).',
    )
    expect(toastMocks.success).not.toHaveBeenCalled()
    expect(reads()).toHaveLength(1)

    // Back returns to the booking's actions.
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByRole('button', { name: 'Mark No-Show' })).toBeInTheDocument()
  })

  it('cancels a confirmed booking with a reason', async () => {
    current = booking()
    stubActions({ cancel: { booking: { ...current, status: 'cancelled' } } })
    render(<BookingDetail bookingId="bk_1" />)

    fireEvent.click(await screen.findByRole('button', { name: 'Cancel booking' }))
    const confirm = screen.getByRole('button', { name: 'Confirm Cancellation' })
    fireEvent.click(confirm)
    expect(await screen.findByText('A cancellation reason is required.')).toBeInTheDocument()
    expect(posts('cancel')).toHaveLength(0)

    fireEvent.change(screen.getByLabelText('Cancellation Reason'), {
      target: { value: '  Branch closed for Diwali  ' },
    })
    fireEvent.click(confirm)

    await waitFor(() => expect(posts('cancel')).toHaveLength(1))
    expect(bodyOf(posts('cancel')[0])).toEqual({
      branchId: 'rs',
      reason: 'Branch closed for Diwali',
    })
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith('Booking cancelled'))
    await waitFor(() => expect(reads()).toHaveLength(2))
  })

  it('says a cancelled session’s minutes go back to the membership', async () => {
    current = SESSION
    render(<BookingDetail bookingId="bk_1" />)

    fireEvent.click(await screen.findByRole('button', { name: 'Cancel booking' }))

    expect(
      screen.getByText(/the session’s minutes go back to the membership\./),
    ).toBeInTheDocument()
  })

  it('offers a pending booking a move, and rejecting it instead of a cancel', async () => {
    current = booking({ status: 'pending' })
    stubActions({ reschedule: { booking: current, needsStaff: false } })
    render(<BookingDetail bookingId="bk_1" />)

    expect(await screen.findByRole('button', { name: 'Reject' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel booking' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Move booking' }))
    await pick('New start time', '04:00 PM')
    fireEvent.click(screen.getByRole('button', { name: 'Move Booking' }))

    await waitFor(() => expect(posts('reschedule')).toHaveLength(1))
    expect(bodyOf(posts('reschedule')[0])).toEqual({
      branchId: 'rs',
      bookingDate: '2026-11-05',
      startTime: '16:00',
    })
    expect(toastMocks.warning).not.toHaveBeenCalled()
  })

  it('offers no move or cancel once a booking has started', async () => {
    current = booking({ status: 'in_progress' })
    render(<BookingDetail bookingId="bk_1" />)

    expect(await screen.findByRole('button', { name: 'Complete & Checkout' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Move booking' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Cancel booking' })).toBeNull()
  })
})
