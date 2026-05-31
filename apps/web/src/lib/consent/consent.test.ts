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
