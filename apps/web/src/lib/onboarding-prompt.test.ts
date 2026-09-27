/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/web)
 * Module Name  : onboarding-prompt.test
 * Scope        : Authentication — onboarding routing contract
 *
 * Description  : Tests for the booking-context helpers that carry a Book Now
 *                through the onboarding detour: which URL parameters are kept,
 *                how visitor-controlled values are bounded, and the onboarding
 *                URL the homepage's booking gate redirects to.
 *
 * Tech Stack   : Vitest
 * Layer        : Test
 ************************************************************/

import { describe, expect, it } from 'vitest'

import {
  BOOKING_CONTEXT_PARAMS,
  hasBookingIntent,
  onboardingPathForBooking,
  readBookingContext,
} from './onboarding-prompt'

describe('readBookingContext', () => {
  it('keeps the booking and acquisition parameters and drops every other one', () => {
    expect(
      readBookingContext({
        book: '1',
        service: 'signature-haircut',
        utm_source: 'walkin',
        utm_campaign: 'diwali',
        utm_medium: 'qr',
        leadId: 'lead_9',
        fbclid: 'abc123',
        ref: 'somewhere',
      }),
    ).toEqual({
      book: '1',
      service: 'signature-haircut',
      utm_source: 'walkin',
      utm_campaign: 'diwali',
      utm_medium: 'qr',
      leadId: 'lead_9',
    })
  })

  it('takes the first value of a repeated parameter, trimmed, and skips empty ones', () => {
    expect(
      readBookingContext({ book: ['1', '0'], utm_source: '  gmb ', service: '', leadId: '   ' }),
    ).toEqual({ book: '1', utm_source: 'gmb' })
  })

  it('caps a visitor-supplied value at 120 characters', () => {
    expect(readBookingContext({ utm_campaign: 'x'.repeat(500) }).utm_campaign).toHaveLength(120)
  })

  it('reads nothing from an empty query string', () => {
    expect(readBookingContext({})).toEqual({})
  })
})

describe('onboardingPathForBooking', () => {
  it('points at the onboarding form with the booking intent', () => {
    expect(onboardingPathForBooking({ book: '1' })).toBe('/onboarding?book=1')
  })

  it('carries the context URL-encoded, so it reads back unchanged', () => {
    const path = onboardingPathForBooking({ book: '1', service: 'a&b=c d', utm_source: 'walkin' })
    const url = new URL(path, 'https://theroyalglow.in')

    expect(url.pathname).toBe('/onboarding')
    expect(url.searchParams.get('service')).toBe('a&b=c d')
    expect(url.searchParams.get('utm_source')).toBe('walkin')
  })

  it('always marks the booking intent, whatever the incoming `book` value', () => {
    const url = new URL(onboardingPathForBooking({ book: ['1', '0'] }), 'https://theroyalglow.in')

    expect(url.searchParams.getAll('book')).toEqual(['1'])
  })

  it('leaves out parameters that are not booking context', () => {
    expect(onboardingPathForBooking({ book: '1', fbclid: 'abc', next: '//evil.example' })).toBe(
      '/onboarding?book=1',
    )
  })
})

describe('hasBookingIntent', () => {
  it('matches the booking dialog trigger: the first `book` value must be "1"', () => {
    expect(hasBookingIntent({ book: '1' })).toBe(true)
    expect(hasBookingIntent({ book: ['1', '0'] })).toBe(true)
    expect(hasBookingIntent({ book: ['0', '1'] })).toBe(false)
    expect(hasBookingIntent({ book: 'true' })).toBe(false)
    expect(hasBookingIntent({})).toBe(false)
  })
})

describe('BOOKING_CONTEXT_PARAMS', () => {
  it('lists what the onboarding API attributes and the homepage replays', () => {
    expect([...BOOKING_CONTEXT_PARAMS].sort()).toEqual(
      ['book', 'leadId', 'service', 'utm_campaign', 'utm_medium', 'utm_source'].sort(),
    )
  })
})
