/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/web)
 * Module Name  : OnboardingPage (server component test)
 * Scope        : Authentication UI — onboarding before booking
 *
 * Description  : Checks the onboarding page's wiring: its query string reaches
 *                the guard (so a customer who already has a profile is sent
 *                on to the booking) and, as booking context, the form (so the
 *                form reopens the booking afterwards).
 *
 * Tech Stack   : Vitest
 * Layer        : Testing (Presentation / Page)
 ************************************************************/

import { describe, expect, it, vi } from 'vitest'

// The guard resolves the session and the profile; both are covered by
// onboarding-guard.test.ts. Here it only has to be called correctly.
const guardMock = vi.hoisted(() => ({ requireOnboardingPending: vi.fn() }))
vi.mock('@/lib/onboarding-guard', () => guardMock)

import { OnboardingForm } from './onboarding-form'
import OnboardingPage from './page'

describe('OnboardingPage', () => {
  it('hands its query string to the guard and its booking context to the form', async () => {
    const params = {
      book: '1',
      service: 'signature-haircut',
      utm_source: 'walkin',
      fbclid: 'abc123',
    }
    guardMock.requireOnboardingPending.mockResolvedValue({
      user: { name: 'Asha Rao', email: 'asha@example.com' },
    })

    const element = await OnboardingPage({ searchParams: Promise.resolve(params) })

    expect(guardMock.requireOnboardingPending).toHaveBeenCalledWith(params)
    expect(element.type).toBe(OnboardingForm)
    expect(element.props).toEqual({
      userName: 'Asha Rao',
      userEmail: 'asha@example.com',
      bookingContext: { book: '1', service: 'signature-haircut', utm_source: 'walkin' },
    })
  })
})
