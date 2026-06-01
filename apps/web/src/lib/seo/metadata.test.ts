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
