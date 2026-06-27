/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 09-06-2026 & Updated - 09-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : DashboardOverview (component test)
 * Scope        : Admin Portal — Dashboard UI
 *
 * Description  : Component tests for the redesigned dashboard overview widget.
 *                Verifies composition (≥4 KPI cards + a recharts ChartCard + a
 *                recent-activity DataTable), the loading skeleton, the empty
 *                state, the error state with retry, the 10-second timeout → error
 *                transition, and that retry re-requests the dashboard data. The
 *                rendered success state is also asserted free of accessibility
 *                violations.
 *
 * Tech Stack   : Vitest, @testing-library/react, jest-axe, jsdom
 * Layer        : Testing (Presentation / Component)
 *
 * Notes        :
 * - Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5, 10.7, 10.8
 * - The admin test project has no MSW server, so `fetch` is stubbed on the
 *   global with vi.stubGlobal — no real network access occurs. `next/link` and
 *   `next/navigation` are mocked so rendering needs no App Router context.
 * - Fake timers are used only for the 10s-timeout assertion; the other cases
 *   run on real timers so promise/state settling stays straightforward.
 ************************************************************/

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { axe } from 'jest-axe'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AdminBooking } from '@/lib/admin/bookings'
import { DashboardOverview } from './dashboard-overview'

// next/link → a plain anchor (no App Router context in jsdom). The dashboard
// renders Links in the recent-activity row action and the "View all" header.
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: unknown
    children: React.ReactNode
  }) => (
    <a href={typeof href === 'string' ? href : '#'} {...rest}>
      {children}
    </a>
  ),
}))

// The DataTable primitive does not use next/navigation, but stub it defensively
// so any transitive consumer resolves without a router.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}))

// Today's date in IST as YYYY-MM-DD, mirroring the component's own derivation,
// so seeded bookings count as "today" regardless of when the suite runs.
function todayIST(): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(new Date())
}

function sampleBooking(overrides: Partial<AdminBooking> = {}): AdminBooking {
  return {
    id: 'bk_1',
    bookingNumber: 'BK-RS-2606-H-38291',
    status: 'completed',
    serviceType: 'salon',
    bookingDate: todayIST(),
    startTime: '10:00',
    endTime: '10:30',
    totalAmountPaise: 100_000, // ₹1,000.00
    customerName: 'Asha Rao',
    customerEmail: 'asha@example.com',
    notes: null,
    services: [
      {
        id: 'bs_1',
        serviceNameSnapshot: 'Signature Haircut',
        priceAtBookingPaise: 100_000,
        durationMinutes: 30,
        staffId: null,
      },
    ],
    ...overrides,
  }
}

// Successful GET /api/bookings envelope: { success: true, data: { bookings } }.
function ok(bookings: AdminBooking[]): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ success: true, data: { bookings } }),
  } as Response
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('DashboardOverview (Req 10)', () => {
  it('composes ≥4 KPI cards, a chart card, and a recent-activity table (10.1/10.2/10.3/10.6)', async () => {
    const bookings = [
      sampleBooking(),
      sampleBooking({
        id: 'bk_2',
        bookingNumber: 'BK-RS-2606-S-11222',
        status: 'pending',
        customerName: 'Meera Nair',
      }),
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(ok(bookings))),
    )

    const { container } = render(<DashboardOverview />)

    // Four KPI cards by their labels (Req 10.1).
    expect(await screen.findByText("Today's Bookings")).toBeInTheDocument()
    expect(screen.getByText('Pending Approval')).toBeInTheDocument()
    expect(screen.getByText("Today's Revenue")).toBeInTheDocument()
    expect(screen.getByText('Total Bookings')).toBeInTheDocument()

    // Monetary KPI uses Indian grouping with two decimals (Req 10.6).
    expect(screen.getByText('₹1,000.00')).toBeInTheDocument()

    // Chart card present (Req 10.2).
    expect(screen.getByText('Bookings — last 7 days')).toBeInTheDocument()

    // Recent-activity data table present with the API-sourced rows (Req 10.3).
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByText('Asha Rao')).toBeInTheDocument()
    expect(screen.getByText('BK-RS-2606-H-38291')).toBeInTheDocument()

    // Composed success state is accessible.
    const results = await axe(container)
    expect(results.violations).toEqual([])
  })

  it('renders loading skeleton placeholders while data is in flight (10.4)', () => {
    // A never-resolving fetch keeps the dashboard in its loading state.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
    )

    render(<DashboardOverview />)

    // Skeleton presenter announces loading; KPI value placeholders are busy.
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('renders an empty-state presenter when there are no bookings (10.7)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(ok([]))),
    )

    render(<DashboardOverview />)

    // Empty-state message replaces the recent-activity table rows (Req 10.7).
    expect(await screen.findByText('No bookings yet.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()

    // KPI cards still render (now with zeroed values).
    expect(screen.getByText("Today's Bookings")).toBeInTheDocument()
  })

  it('renders an error presenter with a retry control when the request fails (10.5)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('Could not load dashboard data.'))),
    )

    render(<DashboardOverview />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Could not load dashboard data.')
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('renders the error presenter after a 10-second timeout (10.8)', async () => {
    vi.useFakeTimers()
    // A fetch that never settles, so only the timeout deadline resolves it.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
    )

    render(<DashboardOverview />)

    // Still loading just before the deadline.
    expect(screen.getByText('Loading…')).toBeInTheDocument()

    // Advance to the 10s dashboard timeout → error presenter (Req 10.8).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })

    expect(screen.getByRole('alert')).toHaveTextContent('The request timed out. Please try again.')
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('re-requests the dashboard data when retry is activated (10.5)', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('Could not load dashboard data.'))
      .mockResolvedValueOnce(ok([sampleBooking()]))
    vi.stubGlobal('fetch', fetchMock)

    render(<DashboardOverview />)

    // First attempt fails.
    const retry = await screen.findByRole('button', { name: 'Retry' })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // Retry re-issues the request and the success state renders.
    fireEvent.click(retry)

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('Asha Rao')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
