/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/web)
 * Module Name  : post-onboarding-destination.test
 * Scope        : Authentication — post-onboarding routing
 *
 * Description  : Tests that a booking intent survives the onboarding detour.
 *
 *                A new customer who taps "Book Now" is routed to /onboarding by
 *                newUserCallbackURL, which overrides BookingDialog's own
 *                '/?book=1' callback. Without replaying the intent afterwards
 *                the customer is dropped on a bare homepage having lost what
 *                they set out to do.
 *
 * Tech Stack   : Vitest
 * Layer        : Test
 ************************************************************/

import { describe, expect, it } from 'vitest'

import { buildPostOnboardingDestination } from './post-onboarding-destination'

describe('buildPostOnboardingDestination', () => {
  it('defaults to the homepage when there was no booking intent', () => {
    expect(buildPostOnboardingDestination({})).toBe('/')
  })

  it('reopens the booking dialog when the customer had tapped Book Now', () => {
    expect(buildPostOnboardingDestination({ book: '1' })).toBe('/?book=1')
  })

  it('carries a service preselection through', () => {
    expect(buildPostOnboardingDestination({ book: '1', service: 'svc_123' })).toBe(
      '/?book=1&service=svc_123',
    )
  })

  it('ignores UTM/lead context, which belongs to the profile row not the route', () => {
    // These are posted to /api/onboarding/complete as acquisition attribution;
    // replaying them in the URL would be redundant and leak campaign data.
    const destination = buildPostOnboardingDestination({
      utm_source: 'gmb',
      utm_campaign: 'monsoon',
      leadId: 'lead_9',
    })

    expect(destination).toBe('/')
  })

  it('does not treat a non-"1" book value as an intent', () => {
    expect(buildPostOnboardingDestination({ book: '0' })).toBe('/')
    expect(buildPostOnboardingDestination({ book: 'true' })).toBe('/')
  })

  it('URL-encodes a visitor-supplied service value', () => {
    // `service` originates from a URL the visitor controlled, so it must never
    // be interpolated raw into the destination.
    const destination = buildPostOnboardingDestination({
      book: '1',
      service: 'a&b=c d',
    })

    expect(destination).toBe('/?book=1&service=a%26b%3Dc+d')
    expect(new URL(destination, 'https://theroyalglow.in').searchParams.get('service')).toBe(
      'a&b=c d',
    )
  })
})
