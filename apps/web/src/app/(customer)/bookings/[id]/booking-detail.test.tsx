/************************************************************
 * Module Name  : BookingDetail (component test)
 * Scope        : Booking Management — a customer's booking page (R6.3)
 *
 * Description  : The booking page under its branch's rules:
 *                - cancelling asks first, and says when it would be late
 *                  (allowed, never charged, noted on the record);
 *                - rescheduling offers the branch's free times for the chosen
 *                  date, long enough for the booking, or says why there are
 *                  none, and is replaced by the reason when the rules no
 *                  longer allow it;
 *                - without readable rules, cancelling is still offered.
 *
 * Tech Stack   : Vitest, @testing-library/react, jsdom, MSW
 * Layer        : Testing (Presentation / Component)
 ************************************************************/

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw/http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { server } from '@/test/msw-server'

vi.mock('@/components/realtime/RealtimeProvider', () => ({ useBookingStatus: vi.fn() }))

import { BookingDetail, cancelWarning } from './booking-detail'

const LOAD = { timeout: 3000 }

function booking(overrides: Record<string, unknown> = {}) {
  return {
    id: 'bk_1',
    bookingNumber: 'BK-RS-2611-H-12345',
    branchId: 'branch_rs',
    status: 'confirmed',
    serviceType: 'salon',
    bookingDate: '2026-11-10T00:00:00.000Z',
    startTime: '13:00:00',
    endTime: '14:00:00',
    totalAmountPaise: 80000,
    totalDurationMinutes: 60,
    rescheduleCount: 0,
    notes: null,
    confirmedAt: '2026-11-01T05:00:00.000Z',
    completedAt: null,
    cancelledAt: null,
    cancellationReason: null,
    rejectedAt: null,
    rejectionReason: null,
    createdAt: '2026-11-01T04:00:00.000Z',
    services: [
      {
        id: 'bs1',
        serviceNameSnapshot: 'Signature Haircut',
        priceAtBookingPaise: 80000,
        durationMinutes: 60,
        displayOrder: 0,
      },
    ],
    ...overrides,
  }
}

const TERMS = {
  cancel: { late: false, cutoffHours: 4 },
  reschedule: { allowed: true, remaining: 2, cutoffHours: 1 },
}

function mockBooking(terms: unknown = TERMS, overrides: Record<string, unknown> = {}) {
  server.use(
    http.get('*/api/bookings/bk_1', () =>
      HttpResponse.json({ success: true, data: { booking: booking(overrides), terms } }),
    ),
  )
}

async function renderPage() {
  render(<BookingDetail id="bk_1" />)
  await screen.findByRole('heading', { name: 'BK-RS-2611-H-12345' }, LOAD)
}

afterEach(() => {
  cleanup()
})

describe('BookingDetail — cancelling', () => {
  it('asks before cancelling, and keeping the booking sends nothing', async () => {
    const cancel = vi.fn()
    mockBooking()
    server.use(
      http.post('*/api/bookings/bk_1/cancel', () => {
        cancel()
        return HttpResponse.json({
          success: true,
          data: { id: 'bk_1', status: 'cancelled', late: false },
        })
      }),
    )
    await renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel Booking' }))
    const confirm = screen.getByRole('group', { name: 'Cancel this booking?' })
    expect(confirm).toHaveFocus()
    expect(confirm).toHaveAccessibleDescription('You can book again at any time.')

    fireEvent.click(screen.getByRole('button', { name: 'Keep Booking' }))
    expect(screen.queryByRole('group', { name: 'Cancel this booking?' })).toBeNull()
    expect(cancel).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel Booking' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, Cancel Booking' }))
    expect(await screen.findByText('Booking cancelled.', {}, LOAD)).toBeInTheDocument()
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('says a cancellation now is late before it happens, and after', async () => {
    mockBooking({ ...TERMS, cancel: { late: true, cutoffHours: 4 } })
    server.use(
      http.post('*/api/bookings/bk_1/cancel', () =>
        HttpResponse.json({ success: true, data: { id: 'bk_1', status: 'cancelled', late: true } }),
      ),
    )
    await renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel Booking' }))
    expect(screen.getByRole('group', { name: 'Cancel this booking?' })).toHaveTextContent(
      "Your appointment is less than 4 hours away, so this counts as a late cancellation. You won't be charged, but it's noted on your record.",
    )

    fireEvent.click(screen.getByRole('button', { name: 'Yes, Cancel Booking' }))
    expect(
      await screen.findByText(/It was a late cancellation: you weren't charged/, {}, LOAD),
    ).toBeInTheDocument()
  })

  it('still offers cancelling when the branch’s rules can’t be read', async () => {
    mockBooking(null)
    await renderPage()

    expect(screen.getByRole('button', { name: 'Cancel Booking' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reschedule' })).toBeNull()
  })

  it('writes the warning from the terms', () => {
    expect(cancelWarning(null)).toBe('You can book again at any time.')
    expect(cancelWarning({ ...TERMS, cancel: { late: true, cutoffHours: 1 } } as never)).toMatch(
      /less than 1 hour away/,
    )
  })
})

describe('BookingDetail — rescheduling', () => {
  it("offers the branch's free times for the date, long enough for the booking", async () => {
    const availabilityUrls: string[] = []
    let sent: unknown = null
    mockBooking()
    server.use(
      http.get('*/api/availability', ({ request }) => {
        availabilityUrls.push(request.url)
        return HttpResponse.json({
          success: true,
          data: {
            slots: [
              { startTime: '12:00', endTime: '12:30', available: false },
              { startTime: '12:30', endTime: '13:00', available: true },
              { startTime: '13:00', endTime: '13:30', available: true },
            ],
            closure: null,
            notice: null,
          },
        })
      }),
      http.post('*/api/bookings/bk_1/reschedule', async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json({ success: true, data: { id: 'bk_1', status: 'confirmed' } })
      }),
    )
    await renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Reschedule' }))
    expect(screen.getByText('You can reschedule this booking 2 more times.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('New date'), { target: { value: '2026-11-12' } })

    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(2), LOAD)
    const params = new URL(availabilityUrls[0] ?? '').searchParams
    expect(params.get('date')).toBe('2026-11-12')
    expect(params.get('branchId')).toBe('branch_rs')
    expect(params.get('durationMinutes')).toBe('60')
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      '12:30 PM',
      '01:00 PM',
    ])

    fireEvent.change(screen.getByLabelText('New time'), { target: { value: '13:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm New Slot' }))
    await waitFor(
      () => expect(sent).toEqual({ bookingDate: '2026-11-12', startTime: '13:00' }),
      LOAD,
    )
  })

  it('says why a date has no times', async () => {
    mockBooking()
    server.use(
      http.get('*/api/availability', () =>
        HttpResponse.json({
          success: true,
          data: { slots: [], closure: null, notice: 'Rayasandra is closed on Tuesdays.' },
        }),
      ),
    )
    await renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Reschedule' }))
    fireEvent.change(screen.getByLabelText('New date'), { target: { value: '2026-11-17' } })

    expect(
      await screen.findByText('Rayasandra is closed on Tuesdays.', {}, LOAD),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('New time')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Confirm New Slot' })).toBeDisabled()
  })

  it('shows why the booking can no longer be moved, and keeps cancelling', async () => {
    mockBooking({
      cancel: { late: true, cutoffHours: 4 },
      reschedule: {
        allowed: false,
        code: 'WINDOW_PASSED',
        message: 'Reschedule at least 1 hour before the appointment. You can still cancel it.',
      },
    })
    await renderPage()

    expect(
      screen.getByText(
        'Reschedule at least 1 hour before the appointment. You can still cancel it.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reschedule' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Cancel Booking' })).toBeInTheDocument()
  })

  it('offers nothing for a finished booking', async () => {
    mockBooking(
      {
        cancel: null,
        reschedule: {
          allowed: false,
          code: 'NOT_RESCHEDULABLE',
          message: 'This booking can’t be rescheduled.',
        },
      },
      { status: 'completed', completedAt: '2026-11-10T09:00:00.000Z' },
    )
    await renderPage()

    expect(screen.queryByRole('region', { name: 'Manage booking' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Cancel Booking' })).toBeNull()
  })
})
