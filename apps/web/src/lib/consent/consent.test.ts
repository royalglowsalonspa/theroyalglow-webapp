/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : consent.test
 * Scope        : Cookie Consent — Tests
 *
 * Description  : Unit tests for the cookie consent module verifying
 *                round-trip persistence, default state, and reject behaviour.
 *
 * Responsibilities :
 * - Verify undecided default state when nothing is stored
 * - Test round-trip of consent choices via localStorage
 * - Test rejectNonEssential behaviour
 * - Property-based test for arbitrary boolean pairs
 *
 * Features / Functionality :
 * - Default state assertion (decided: false)
 * - setConsent/getConsent round-trip verification
 * - rejectNonEssential verification
 * - PBT for 200 random analytics/marketing boolean combinations
 *
 * Tech Stack   : TypeScript, Vitest
 * Layer        : Testing
 *
 * Dependencies : vitest, ./consent
 *
 * Notes        : None
 ************************************************************/

import { beforeEach, describe, expect, it } from 'vitest'
import { getConsent, rejectNonEssential, setConsent } from './consent'

describe('consent', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('reads decided:false when nothing is stored', () => {
    const state = getConsent()
    expect(state.decided).toBe(false)
    expect(state.necessary).toBe(true)
    expect(state.analytics).toBe(false)
    expect(state.marketing).toBe(false)
  })

  it('round-trips a saved choice with necessary always true and decided true', () => {
    setConsent({ analytics: true, marketing: false })
    const state = getConsent()
    expect(state).toEqual({
      necessary: true,
      analytics: true,
      marketing: false,
      decided: true,
    })
  })

  it('rejectNonEssential keeps only necessary', () => {
    setConsent({ analytics: true, marketing: true })
    rejectNonEssential()
    const state = getConsent()
    expect(state.analytics).toBe(false)
    expect(state.marketing).toBe(false)
    expect(state.necessary).toBe(true)
    expect(state.decided).toBe(true)
  })

  it('round-trips for arbitrary boolean pairs (PBT)', () => {
    for (let i = 0; i < 200; i++) {
      const analytics = Math.random() < 0.5
      const marketing = Math.random() < 0.5
      setConsent({ analytics, marketing })
      const state = getConsent()
      expect(state.analytics).toBe(analytics)
      expect(state.marketing).toBe(marketing)
      expect(state.necessary).toBe(true)
      expect(state.decided).toBe(true)
    }
  })
})
