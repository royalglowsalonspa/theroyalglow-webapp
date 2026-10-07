/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/web)
 * Module Name  : OnboardingForm (component test)
 * Scope        : Authentication UI — onboarding before booking
 *
 * Description  : Component tests for where the onboarding form sends a
 *                customer and what it attributes the profile to. Covers both
 *                ways into the form on the way to a booking:
 *                - Book Now by a signed-in customer without a profile, whose
 *                  booking context arrives in the onboarding URL
 *                  (`bookingContext`)
 *                - a first-time Google sign-in, whose context was saved in
 *                  sessionStorage before the OAuth redirect
 *
 * Tech Stack   : Vitest, @testing-library/react, jsdom, MSW
 * Layer        : Testing (Presentation / Component)
 *
 * Notes        : POST /api/onboarding/complete is mocked with MSW; the App
 *                Router is stubbed because jsdom has none.
 ************************************************************/

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw/http'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { server } from '@/test/msw-server'

const routerMock = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => routerMock }))

// Radix Switch (the consent toggles) reads ResizeObserver on mount, which
// jsdom does not implement.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}

import { OnboardingForm } from './onboarding-form'

// The sessionStorage key the sign-in helper saves context under.
const AUTH_CONTEXT_KEY = 'rgss_auth_context'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  sessionStorage.clear()
  localStorage.clear()
})

// Accept the onboarding submission and record each request body.
function acceptOnboarding(): Record<string, unknown>[] {
  const bodies: Record<string, unknown>[] = []
  server.use(
    http.post('*/api/onboarding/complete', async ({ request }) => {
      bodies.push((await request.json()) as Record<string, unknown>)
      return HttpResponse.json({ success: true, data: { profileId: 'cp_1' } }, { status: 201 })
    }),
  )
  return bodies
}

function renderForm(bookingContext?: Record<string, string>) {
  return render(
    <OnboardingForm
      userName="Asha Rao"
      userEmail="asha@example.com"
      {...(bookingContext ? { bookingContext } : {})}
    />,
  )
}

function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText('Phone Number'), { target: { value: '9876543210' } })
  fireEvent.change(screen.getByLabelText('Date of Birth'), { target: { value: '1995-04-12' } })
  fireEvent.change(screen.getByLabelText('Gender'), { target: { value: 'female' } })
  fireEvent.click(screen.getByRole('switch', { name: /privacy policy/i }))
}

describe('OnboardingForm on the way to a booking', () => {
  it('says the booking comes next, then goes back to it with the Book Now context', async () => {
    const bodies = acceptOnboarding()
    renderForm({ book: '1', utm_source: 'walkin' })

    expect(screen.getByText(/before you book/i)).toBeInTheDocument()
    fillRequiredFields()
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Booking' }))

    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith('/?book=1'))
    expect(routerMock.push).not.toHaveBeenCalled()
    expect(bodies).toEqual([
      expect.objectContaining({
        name: 'Asha Rao',
        phone: '9876543210',
        dateOfBirth: '1995-04-12',
        gender: 'female',
        privacyConsent: true,
        utmSource: 'walkin',
      }),
    ])
  })

  it('attributes the profile to the context saved before sign-in over the onboarding URL', async () => {
    sessionStorage.setItem(AUTH_CONTEXT_KEY, JSON.stringify({ book: '1', utm_source: 'gmb' }))
    const bodies = acceptOnboarding()
    renderForm({ book: '1', utm_source: 'walkin' })

    fillRequiredFields()
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Booking' }))

    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith('/?book=1'))
    expect(bodies[0]).toMatchObject({ utmSource: 'gmb' })
    expect(sessionStorage.getItem(AUTH_CONTEXT_KEY)).toBeNull()
  })

  it('picks up a booking saved before a first-time Google sign-in', async () => {
    // newUserCallbackURL is a bare /onboarding, so the intent is only in
    // sessionStorage, which the form reads after mounting.
    sessionStorage.setItem(AUTH_CONTEXT_KEY, JSON.stringify({ book: '1', leadId: 'lead_9' }))
    const bodies = acceptOnboarding()
    renderForm()

    expect(await screen.findByText(/before you book/i)).toBeInTheDocument()
    fillRequiredFields()
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Booking' }))

    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith('/?book=1'))
    expect(bodies[0]).toMatchObject({ leadId: 'lead_9' })
  })
})

describe('OnboardingForm without a booking', () => {
  it('goes to the homepage', async () => {
    const bodies = acceptOnboarding()
    renderForm()

    expect(screen.getByText('Tell us a bit about yourself to get started.')).toBeInTheDocument()
    fillRequiredFields()
    fireEvent.click(screen.getByRole('button', { name: 'Complete Profile' }))

    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith('/'))
    expect(bodies).toHaveLength(1)
  })

  it('still completes when the saved context is unreadable', async () => {
    // A corrupt value used to throw inside the submit handler, which then
    // showed "Connection failed" and never saved the profile.
    sessionStorage.setItem(AUTH_CONTEXT_KEY, '{not json')
    const bodies = acceptOnboarding()
    renderForm()

    fillRequiredFields()
    fireEvent.click(screen.getByRole('button', { name: 'Complete Profile' }))

    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith('/'))
    expect(bodies).toHaveLength(1)
    expect(screen.queryByText(/connection failed/i)).not.toBeInTheDocument()
  })
})
