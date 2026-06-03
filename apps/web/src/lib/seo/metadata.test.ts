/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : metadata.test
 * Scope        : SEO — Metadata Tests
 *
 * Description  : Unit tests for the buildMetadata helper verifying canonical
 *                URL construction, robots directives, and double-slash prevention.
 *
 * Responsibilities :
 * - Verify canonical URL has no double slash
 * - Test robots index/follow defaults and overrides
 * - Property-based test for arbitrary path combinations (no //)
 *
 * Features / Functionality :
 * - Canonical URL correctness assertions
 * - robotsIndex=false → noindex/nofollow
 * - PBT: 200 random paths never produce double slashes
 *
 * Tech Stack   : TypeScript, Vitest
 * Layer        : Testing
 *
 * Dependencies : vitest, ./metadata
 *
 * Notes        : None
 ************************************************************/

import { describe, expect, it } from 'vitest'
import { buildMetadata } from './metadata'

describe('buildMetadata', () => {
  it('sets an absolute canonical with no double slash', () => {
    const meta = buildMetadata({
      title: 'Services',
      description: 'Our services',
      path: '/services',
    })
    const canonical = String(meta.alternates?.canonical)
    expect(canonical.endsWith('/services')).toBe(true)
    // No protocol-aside double slash.
    expect(canonical.replace('https://', '')).not.toContain('//')
  })

  it('defaults to indexable and honours robotsIndex=false', () => {
    const indexable = buildMetadata({
      title: 'A',
      description: 'a',
      path: '/a',
    })
    expect(indexable.robots).toMatchObject({ index: true, follow: true })

    const hidden = buildMetadata({
      title: 'B',
      description: 'b',
      path: '/b',
      robotsIndex: false,
    })
    expect(hidden.robots).toMatchObject({ index: false, follow: false })
  })

  it('never yields a double slash for arbitrary leading-slash paths (PBT)', () => {
    const segments = ['services', 'about', 'blog', 'faq', 'offers', 'gallery']
    for (let i = 0; i < 200; i++) {
      const depth = 1 + Math.floor(Math.random() * 3)
      const path = `/${Array.from({ length: depth }, () => segments[Math.floor(Math.random() * segments.length)]).join('/')}`
      const meta = buildMetadata({ title: 'T', description: 'd', path })
      const canonical = String(meta.alternates?.canonical).replace('https://', '')
      expect(canonical).not.toContain('//')
    }
  })
})
