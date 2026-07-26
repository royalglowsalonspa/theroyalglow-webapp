/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 09-06-2026 & Updated - 09-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : BookingDialog (component test)
 * Scope        : Booking UI — Dialog Wiring
 *
 * Description  : Component tests for the 4-step booking dialog. Verifies it
 *                loads the catalogue on open, loads availability when a date is
 *                selected, submits to POST /api/bookings and shows the returned
 *                booking number, and surfaces the error message on failure.
 *
 * Tech Stack   : Vitest, @testing-library/react, jsdom, MSW
 * Layer        : Testing (Presentation / Component)
 *
 * Notes        :
 * - Validates: Requirements 14.1, 14.2, 14.3, 14.4
 * - Endpoints are mocked with MSW (no real network). The auth-client
 *   (useSession), analytics (track), and google-signin modules are mocked so
 *   the dialog runs as a signed-in customer with no side effects.
 ************************************************************/

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { server } from '@/test/msw-server'

// Signed-in session so the submit path posts a booking (rather than launching
// the Google sign-in redirect).
vi.mock('@/lib/auth-client', () => ({
  useSession: () => ({ data: { user: { id: 'cust_1', name: 'Asha' } } }),
}))
vi.mock('@/lib/analytics/events', () => ({ track: vi.fn() }))
vi.mock('@/lib/google-signin', () => ({ startGoogleSignIn: vi.fn() }))

import { BookingDialog } from './BookingDialog'

// --- Mock API payloads (mirror the real envelopes) ---
function catalogue() {
  return {
    categories: [
      {
        id: 'cat_hair',
        name: 'Hair & Styling',
        slug: 'hair-styling',
        serviceType: 'salon',
        displayOrder: 1,
        services: [
          {
            id: 'svc_cut',
            categoryId: 'cat_hair',
            name: 'Signature Haircut',
            slug: 'signature-haircut',
            durationMinutes: 30,
            pricePaise: 80000,
          },
        ],
      },
    ],
  }
}

function slots() {
  return {
    slots: [
      { startTime: '10:00', endTime: '10:30', available: true },
      { startTime: '10:30', endTime: '11:00', available: true },
    ],
  }
}

function renderDialog() {
  return render(<BookingDialog isOpen onClose={() => {}} />)
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

// Drive the wizard: pick the first date, pick a time, select a category and a
// service, advancing to the summary (step 4).
async function advanceToSummary() {
  // Step 1 — date buttons are the only aria-pressed buttons before slots load.
  const dateButtons = screen.getAllByRole('button').filter((b) => b.hasAttribute('aria-pressed'))
  fireEvent.click(dateButtons[0] as HTMLElement)

  // Availability loads → the slot button appears; select it.
  fireEvent.click(await screen.findByRole('button', { name: '10:00' }))
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))

  // Step 2 — select the salon category.
  fireEvent.click(await screen.findByRole('checkbox', { name: /Hair & Styling/i }))
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))

  // Step 3 — select the service.
  fireEvent.click(await screen.findByRole('checkbox', { name: /Signature Haircut/i }))
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))

  // Step 4 — summary.
  await screen.findByText('Booking Summary')
}

describe('BookingDialog UI wiring (Req 14)', () => {
  it('loads the service catalogue from GET /api/services on open (14.1)', async () => {
    let servicesRequested = false
    server.use(
      http.get('*/api/services', () => {
        servicesRequested = true
        return HttpResponse.json({ success: true, data: catalogue() })
      }),
    )

    renderDialog()

    await waitFor(() => expect(servicesRequested).toBe(true))
  })

  it('loads availability from GET /api/availability when a date is selected (14.2)', async () => {
    let availabilityDate: string | null = null
    server.use(
      http.get('*/api/services', () => HttpResponse.json({ success: true, data: catalogue() })),
      http.get('*/api/availability', ({ request }) => {
        availabilityDate = new URL(request.url).searchParams.get('date')
        return HttpResponse.json({ success: true, data: slots() })
      }),
    )

    renderDialog()

    const dateButtons = screen.getAllByRole('button').filter((b) => b.hasAttribute('aria-pressed'))
    fireEvent.click(dateButtons[0] as HTMLElement)

    // The availability slots render, proving the request fired for the date.
    expect(await screen.findByRole('button', { name: '10:00' })).toBeInTheDocument()
    expect(availabilityDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('submits to POST /api/bookings and shows the returned booking number on success (14.3)', async () => {
    let postedBody: Record<string, unknown> | null = null
    server.use(
      http.get('*/api/services', () => HttpResponse.json({ success: true, data: catalogue() })),
      http.get('*/api/availability', () => HttpResponse.json({ success: true, data: slots() })),
      http.post('*/api/bookings', async ({ request }) => {
        postedBody = (await request.json()) as Record<string, unknown>
        return HttpResponse.json(
          { success: true, data: { bookingNumber: 'BK-RS-2606-H-38291' } },
          { status: 201 },
        )
      }),
    )

    renderDialog()
    await advanceToSummary()

    fireEvent.click(screen.getByRole('button', { name: 'Submit Booking' }))

    expect(await screen.findByText('BK-RS-2606-H-38291')).toBeInTheDocument()
    expect(screen.getByText('Booking Submitted!')).toBeInTheDocument()
    expect(postedBody).toMatchObject({ serviceIds: ['svc_cut'], startTime: '10:00' })
  })

  it('presents the error message when the booking submission fails (14.4)', async () => {
    server.use(
      http.get('*/api/services', () => HttpResponse.json({ success: true, data: catalogue() })),
      http.get('*/api/availability', () => HttpResponse.json({ success: true, data: slots() })),
      http.post('*/api/bookings', () =>
        HttpResponse.json(
          {
            success: false,
            error: { code: 'BOOKING_SLOT_UNAVAILABLE', message: 'That slot was just taken.' },
          },
          { status: 409 },
        ),
      ),
    )

    renderDialog()
    await advanceToSummary()

    fireEvent.click(screen.getByRole('button', { name: 'Submit Booking' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('That slot was just taken.')
  })
})
