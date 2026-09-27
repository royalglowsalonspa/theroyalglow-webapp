/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 09-06-2026 & Updated - 27-09-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : BookingDialog (component test)
 * Scope        : Booking UI — Dialog Wiring
 *
 * Description  : Component tests for the 4-step booking dialog. Verifies it
 *                loads the catalogue and the branches on open, loads the
 *                chosen branch's availability when a date is selected, submits
 *                to POST /api/bookings with that branch and shows the returned
 *                booking number, surfaces errors, and restores a saved booking.
 *
 * Tech Stack   : Vitest, @testing-library/react, jsdom, MSW
 * Layer        : Testing (Presentation / Component)
 *
 * Notes        :
 * - Validates: Requirements 14.1, 14.2, 14.3, 14.4
 * - Endpoints are mocked with MSW (no real network). The auth-client
 *   (useSession), analytics (track), and google-signin modules are mocked so
 *   the dialog runs as a signed-in customer with no side effects.
 * - The availability mock answers 400 "Invalid availability query" without a
 *   `branchId`, as the production API did when the dialog never sent one and
 *   no customer could book. The old mocks accepted any query, which is why
 *   these tests did not catch it.
 ************************************************************/

import type { PublicBranchList } from '@rgss/types'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ONBOARDING_PATH } from '@/lib/onboarding-prompt'
import { server } from '@/test/msw-server'

// Signed-in session so the submit path posts a booking (rather than launching
// the Google sign-in redirect).
vi.mock('@/lib/auth-client', () => ({
  useSession: () => ({ data: { user: { id: 'cust_1', name: 'Asha' } } }),
}))
vi.mock('@/lib/analytics/events', () => ({ track: vi.fn() }))
vi.mock('@/lib/google-signin', () => ({
  startGoogleSignIn: vi.fn(),
  markBookingIntentForOnboarding: vi.fn(),
}))

// The dialog routes to /onboarding when the API answers 403 ONBOARDING_REQUIRED.
// jsdom has no App Router mounted, so useRouter must be stubbed.
const routerPushMock = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPushMock }),
}))

import { BookingDialog } from './BookingDialog'

// The sessionStorage key the dialog saves a booking under across sign-in.
const BOOKING_INTENT_KEY = 'rgss_booking_intent'

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

// Two branches taking bookings and one that is not, as GET /api/branches
// returns them.
function branchList(): PublicBranchList {
  return {
    branches: [
      {
        id: 'branch_rayasandra',
        name: 'Rayasandra',
        city: 'Bengaluru',
        status: 'operational',
        acceptingBookings: true,
      },
      {
        id: 'branch_indiranagar',
        name: 'Indiranagar',
        city: 'Bengaluru',
        status: 'operational',
        acceptingBookings: true,
      },
      {
        id: 'branch_marathahalli',
        name: 'Marathahalli',
        city: 'Bengaluru',
        status: 'opens_soon',
        acceptingBookings: false,
      },
    ],
    defaultBranchId: 'branch_rayasandra',
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

// GET /api/availability that, like the production API before the fix,
// rejects a query without both `date` and `branchId`.
function availabilityHandler(onRequest?: (params: URLSearchParams) => void) {
  return http.get('*/api/availability', ({ request }) => {
    const params = new URL(request.url).searchParams
    onRequest?.(params)
    if (!params.get('date') || !params.get('branchId')) {
      return HttpResponse.json(
        {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid availability query' },
        },
        { status: 400 },
      )
    }
    return HttpResponse.json({ success: true, data: slots() })
  })
}

function bookingCreated(onBody?: (body: Record<string, unknown>) => void) {
  return http.post('*/api/bookings', async ({ request }) => {
    onBody?.((await request.json()) as Record<string, unknown>)
    return HttpResponse.json(
      { success: true, data: { bookingNumber: 'BK-RS-2609-H-38291' } },
      { status: 201 },
    )
  })
}

// Register the dialog's endpoints. Handlers passed in take precedence over
// the defaults (MSW uses the first matching handler).
function mockApi(...overrides: Parameters<typeof server.use>) {
  server.use(
    ...overrides,
    http.get('*/api/services', () => HttpResponse.json({ success: true, data: catalogue() })),
    http.get('*/api/branches', () => HttpResponse.json({ success: true, data: branchList() })),
    availabilityHandler(),
  )
}

function renderDialog() {
  return render(<BookingDialog isOpen onClose={() => {}} />)
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  sessionStorage.clear()
})

// Tomorrow as YYYY-MM-DD in local time, the format the dialog saves.
function tomorrowISO(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

// Date buttons are the only aria-pressed buttons before slots load.
function dateButtons(): HTMLElement[] {
  return screen.getAllByRole('button').filter((b) => b.hasAttribute('aria-pressed'))
}

// Waits on mocked requests get more than the 1s default. The full suite runs
// many jsdom workers in parallel, and under that load a response, or a chain
// of them (branches, then availability), can take longer than a second.
const LOAD = { timeout: 3000 }

function findBranchPicker(): Promise<HTMLElement> {
  return screen.findByRole('combobox', { name: /branch/i }, LOAD)
}

function findSlot(time: string): Promise<HTMLElement> {
  return screen.findByRole('button', { name: time }, LOAD)
}

// The header's close button; the overlay shares its name but is not focusable.
function closeButton(): HTMLElement | undefined {
  return screen
    .getAllByRole('button', { name: 'Close booking dialog' })
    .find((b) => b.tabIndex !== -1)
}

// Drive the wizard as a customer would, once the branch picker has loaded:
// pick the first date, pick a time, select a category and a service,
// advancing to the summary (step 4).
async function advanceToSummary() {
  await findBranchPicker()
  fireEvent.click(dateButtons()[0] as HTMLElement)

  // Availability loads → the slot button appears; select it.
  fireEvent.click(await findSlot('10:00'))
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))

  // Step 2 — select the salon category (the catalogue may still be loading).
  fireEvent.click(await screen.findByRole('checkbox', { name: /Hair & Styling/i }, LOAD))
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))

  // Step 3 — select the service.
  fireEvent.click(await screen.findByRole('checkbox', { name: /Signature Haircut/i }))
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))

  // Step 4 — summary.
  await screen.findByText('Booking Summary', {}, LOAD)
}

describe('BookingDialog UI wiring (Req 14)', () => {
  it('loads the service catalogue from GET /api/services on open (14.1)', async () => {
    let servicesRequested = false
    mockApi(
      http.get('*/api/services', () => {
        servicesRequested = true
        return HttpResponse.json({ success: true, data: catalogue() })
      }),
    )

    renderDialog()

    await waitFor(() => expect(servicesRequested).toBe(true), LOAD)
  })

  it("loads the chosen branch's availability when a date is selected (14.2)", async () => {
    const requests: URLSearchParams[] = []
    mockApi(availabilityHandler((params) => requests.push(params)))

    renderDialog()
    await findBranchPicker()
    fireEvent.click(dateButtons()[0] as HTMLElement)

    // The availability slots render, proving the request fired for the date.
    expect(await findSlot('10:00')).toBeInTheDocument()
    expect(requests).toHaveLength(1)
    expect(requests[0]?.get('date')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(requests[0]?.get('branchId')).toBe('branch_rayasandra')
  })

  it('submits to POST /api/bookings and shows the returned booking number on success (14.3)', async () => {
    let postedBody: Record<string, unknown> | null = null
    mockApi(
      bookingCreated((body) => {
        postedBody = body
      }),
    )

    renderDialog()
    await advanceToSummary()

    fireEvent.click(screen.getByRole('button', { name: 'Submit Booking' }))

    expect(await screen.findByText('BK-RS-2609-H-38291', {}, LOAD)).toBeInTheDocument()
    expect(screen.getByText('Booking Submitted!')).toBeInTheDocument()
    expect(postedBody).toMatchObject({
      branchId: 'branch_rayasandra',
      serviceIds: ['svc_cut'],
      startTime: '10:00',
    })
  })

  it('presents the error message when the booking submission fails (14.4)', async () => {
    mockApi(
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

    expect(await screen.findByRole('alert', {}, LOAD)).toHaveTextContent(
      'That slot was just taken.',
    )
  })
})

describe('BookingDialog branch picker', () => {
  it('shows times from an API that requires a branch, without the customer choosing one', async () => {
    // The P1 regression: the dialog sent only `date`, so every customer saw
    // "Invalid availability query" instead of times.
    mockApi()

    renderDialog()
    fireEvent.click(dateButtons()[0] as HTMLElement)

    expect(await findSlot('10:00')).toBeInTheDocument()
    expect(screen.queryByText('Invalid availability query')).not.toBeInTheDocument()
  })

  it('preselects the default branch and disables one that is not taking bookings', async () => {
    mockApi()

    renderDialog()
    const picker = await findBranchPicker()

    expect(picker).toHaveValue('branch_rayasandra')
    expect(within(picker).getByRole('option', { name: 'Rayasandra, Bengaluru' })).toBeEnabled()
    expect(within(picker).getByRole('option', { name: 'Indiranagar, Bengaluru' })).toBeEnabled()
    expect(
      within(picker).getByRole('option', { name: 'Marathahalli, Bengaluru (Opening soon)' }),
    ).toBeDisabled()
  })

  it('reloads times for a newly chosen branch and drops the time picked for the old one', async () => {
    const requestedBranches: Array<string | null> = []
    mockApi(availabilityHandler((params) => requestedBranches.push(params.get('branchId'))))

    renderDialog()
    const picker = await findBranchPicker()
    fireEvent.click(dateButtons()[0] as HTMLElement)
    fireEvent.click(await findSlot('10:00'))
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()

    fireEvent.change(picker, { target: { value: 'branch_indiranagar' } })

    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    expect(await findSlot('10:00')).toHaveAttribute('aria-pressed', 'false')
    expect(requestedBranches).toEqual(['branch_rayasandra', 'branch_indiranagar'])
  })

  it('books the chosen branch and names it in the summary', async () => {
    let postedBody: Record<string, unknown> | null = null
    mockApi(
      bookingCreated((body) => {
        postedBody = body
      }),
    )

    renderDialog()
    fireEvent.change(await findBranchPicker(), { target: { value: 'branch_indiranagar' } })
    await advanceToSummary()

    expect(screen.getByText('Indiranagar, Bengaluru')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Submit Booking' }))

    expect(await screen.findByText('BK-RS-2609-H-38291', {}, LOAD)).toBeInTheDocument()
    expect(postedBody).toMatchObject({ branchId: 'branch_indiranagar' })
  })

  it('offers a retry when branches fail to load, and asks for no times until one loads', async () => {
    let branchCalls = 0
    const requestedBranches: Array<string | null> = []
    mockApi(
      http.get('*/api/branches', () => {
        branchCalls += 1
        return branchCalls === 1
          ? HttpResponse.json(
              { success: false, error: { code: 'INTERNAL_ERROR', message: 'Database down' } },
              { status: 500 },
            )
          : HttpResponse.json({ success: true, data: branchList() })
      }),
      availabilityHandler((params) => requestedBranches.push(params.get('branchId'))),
    )

    renderDialog()
    expect(await screen.findByRole('alert', {}, LOAD)).toHaveTextContent('Could not load branches.')

    fireEvent.click(dateButtons()[0] as HTMLElement)
    expect(screen.getByText('Available times appear once a branch is selected.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await findBranchPicker()).toHaveValue('branch_rayasandra')
    expect(await findSlot('10:00')).toBeInTheDocument()
    // One request, made only once a branch was known.
    expect(requestedBranches).toEqual(['branch_rayasandra'])
  })

  it('explains that online booking is paused when no branch is taking bookings', async () => {
    mockApi(
      http.get('*/api/branches', () =>
        HttpResponse.json({
          success: true,
          data: {
            branches: branchList().branches.filter((b) => !b.acceptingBookings),
            defaultBranchId: null,
          } satisfies PublicBranchList,
        }),
      ),
    )

    renderDialog()

    expect(await screen.findByRole('alert', {}, LOAD)).toHaveTextContent(
      'Online booking is paused right now.',
    )
    expect(screen.queryByText('Select Date')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  })

  it.each([
    ['its saved branch', 'branch_indiranagar', 'Indiranagar, Bengaluru', 'branch_indiranagar'],
    [
      'the default branch when the saved one is not taking bookings',
      'branch_marathahalli',
      'Rayasandra, Bengaluru',
      'branch_rayasandra',
    ],
    [
      'the default branch when it was saved before the branch picker existed',
      undefined,
      'Rayasandra, Bengaluru',
      'branch_rayasandra',
    ],
  ])(
    'restores a saved booking with %s',
    async (_case, savedBranchId, shownBranch, postedBranchId) => {
      sessionStorage.setItem(
        BOOKING_INTENT_KEY,
        JSON.stringify({
          ...(savedBranchId ? { branchId: savedBranchId } : {}),
          date: tomorrowISO(),
          time: '10:00',
          serviceType: 'salon',
          categoryIds: ['cat_hair'],
          serviceIds: ['svc_cut'],
          notes: '',
        }),
      )
      let postedBody: Record<string, unknown> | null = null
      mockApi(
        bookingCreated((body) => {
          postedBody = body
        }),
      )

      renderDialog()

      expect(await screen.findByText('Booking Summary', {}, LOAD)).toBeInTheDocument()
      expect(screen.getByText(shownBranch)).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Submit Booking' }))

      expect(await screen.findByText('BK-RS-2609-H-38291', {}, LOAD)).toBeInTheDocument()
      expect(postedBody).toMatchObject({
        branchId: postedBranchId,
        bookingDate: tomorrowISO(),
        startTime: '10:00',
        serviceIds: ['svc_cut'],
      })
    },
  )

  it('remembers the chosen branch when the customer must finish onboarding first', async () => {
    mockApi(
      http.post('*/api/bookings', () =>
        HttpResponse.json(
          {
            success: false,
            error: { code: 'ONBOARDING_REQUIRED', message: 'Complete your profile to book.' },
          },
          { status: 403 },
        ),
      ),
    )

    renderDialog()
    fireEvent.change(await findBranchPicker(), { target: { value: 'branch_indiranagar' } })
    await advanceToSummary()
    fireEvent.click(screen.getByRole('button', { name: 'Submit Booking' }))

    await waitFor(() => expect(routerPushMock).toHaveBeenCalledWith(ONBOARDING_PATH), LOAD)
    expect(JSON.parse(sessionStorage.getItem(BOOKING_INTENT_KEY) ?? '{}')).toMatchObject({
      branchId: 'branch_indiranagar',
      time: '10:00',
      serviceIds: ['svc_cut'],
    })
  })
})

describe('BookingDialog focus', () => {
  it('keeps focus on the chosen date while its times load', async () => {
    // Accepts any query, so this checks focus alone.
    mockApi(
      http.get('*/api/availability', () => HttpResponse.json({ success: true, data: slots() })),
    )

    renderDialog()
    const date = dateButtons()[0] as HTMLElement
    date.focus()
    fireEvent.click(date)

    expect(await findSlot('10:00')).toBeInTheDocument()
    expect(date).toHaveFocus()
  })

  it('keeps focus on the branch picker while times reload for a new branch', async () => {
    mockApi()

    renderDialog()
    const picker = await findBranchPicker()
    fireEvent.click(dateButtons()[0] as HTMLElement)
    await findSlot('10:00')

    picker.focus()
    fireEvent.change(picker, { target: { value: 'branch_indiranagar' } })

    expect(await findSlot('10:00')).toBeInTheDocument()
    expect(picker).toHaveFocus()
  })

  it('moves focus into the dialog on open and to the top of each new step', async () => {
    mockApi()

    renderDialog()
    const close = closeButton()
    expect(close).toHaveFocus()

    await findBranchPicker()
    fireEvent.click(dateButtons()[0] as HTMLElement)
    fireEvent.click(await findSlot('10:00'))
    const next = screen.getByRole('button', { name: 'Next' })
    next.focus()
    fireEvent.click(next)

    await screen.findByRole('checkbox', { name: /Hair & Styling/i }, LOAD)
    expect(close).toHaveFocus()
  })

  it('keeps Tab inside the dialog, including after the focused element goes away', async () => {
    mockApi()

    renderDialog()
    await findBranchPicker()
    const close = closeButton()
    // Nothing is chosen yet, so Next is disabled and the last date is the
    // last focusable element.
    const lastDate = dateButtons().at(-1)

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(lastDate).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(close).toHaveFocus()

    // As when a focused "Try again" button disappears: focus falls to the page.
    close?.blur()
    expect(document.body).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(close).toHaveFocus()
  })
})
