/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 09-06-2026 & Updated - 09-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : BookingsTable (component test)
 * Scope        : Admin Portal — Bookings UI Wiring
 *
 * Description  : Component tests for the admin bookings table. Verifies it
 *                sources data from GET /api/bookings, re-requests with filter
 *                params when a filter changes, and shows a loading state while
 *                the request is in flight.
 *
 * Tech Stack   : Vitest, @testing-library/react, jsdom
 * Layer        : Testing (Presentation / Component)
 *
 * Notes        :
 * - Validates: Requirements 15.1, 15.2, 15.3
 * - The admin test project has no MSW server configured, so `fetch` is stubbed
 *   on the global with vi.stubGlobal — no real network access occurs.
 ************************************************************/

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AdminBooking } from '@/lib/admin/bookings'
import { BookingsTable } from './bookings-table'

// The migrated table uses next/navigation's useRouter for the row "View
// details" action. There is no App Router context in jsdom, so stub the
// navigation hooks with no-ops (the tests assert on fetch wiring, not routing).
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}))

function sampleBooking(): AdminBooking {
  return {
    id: 'bk_1',
    bookingNumber: 'BK-RS-2606-H-38291',
    status: 'confirmed',
    serviceType: 'salon',
    bookingDate: '2026-06-09',
    startTime: '10:00',
    endTime: '10:30',
    totalAmountPaise: 80000,
    customerName: 'Asha Rao',
    customerEmail: 'asha@example.com',
    notes: null,
    services: [
      {
        id: 'bs_1',
        serviceNameSnapshot: 'Signature Haircut',
        priceAtBookingPaise: 80000,
        durationMinutes: 30,
        staffId: null,
      },
    ],
  }
}

function ok(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ success: true, data }),
  } as Response
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('BookingsTable UI wiring (Req 15)', () => {
  it('sources the rendered bookings from GET /api/bookings (15.1)', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(ok({ bookings: [sampleBooking()] })))
    vi.stubGlobal('fetch', fetchMock)

    render(<BookingsTable />)

    // The row data comes from the API response.
    expect(await screen.findByText('Asha Rao')).toBeInTheDocument()
    expect(screen.getByText('BK-RS-2606-H-38291')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/bookings'))
  })

  it('re-requests the filtered set with filter params on filter change (15.2)', async () => {
    const fetchMock = vi.fn((..._args: unknown[]) => Promise.resolve(ok({ bookings: [] })))
    vi.stubGlobal('fetch', fetchMock)

    render(<BookingsTable />)

    // Initial load (no filter params).
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain('status=')

    // Change the status filter → a new request carrying the filter param.
    fireEvent.keyDown(screen.getByLabelText('Status'), { key: 'Enter' })
    fireEvent.click(await screen.findByRole('option', { name: 'Confirmed' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('status=confirmed')

    // Change the service-type filter → another request carrying that param too.
    fireEvent.click(screen.getByRole('tab', { name: 'Salon' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
    expect(String(fetchMock.mock.calls[2]?.[0])).toContain('serviceType=salon')
  })

  it('presents a loading state while the request is in flight (15.3)', async () => {
    // A controllable promise keeps the request pending so the loading state is
    // observable before resolution.
    let resolveFetch: (r: Response) => void = () => {}
    const pending = new Promise<Response>((resolve) => {
      resolveFetch = resolve
    })
    const fetchMock = vi.fn(() => pending)
    vi.stubGlobal('fetch', fetchMock)

    render(<BookingsTable />)

    // The shared Skeleton presenter announces loading via an sr-only label.
    expect(screen.getByText('Loading…')).toBeInTheDocument()

    // Resolve and confirm the loading state clears.
    resolveFetch(ok({ bookings: [] }))
    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument())
  })
})
