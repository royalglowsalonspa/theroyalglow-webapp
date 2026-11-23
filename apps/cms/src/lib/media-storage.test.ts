import { describe, expect, it } from 'vitest'
import { publicMediaFileUrl, readPublicMediaOrigin } from './media-storage'

describe('CMS public object URLs', () => {
  const origin = 'https://media.theroyalglow.in'

  it('uses the default CMS prefix and preserves generated filenames', () => {
    expect(publicMediaFileUrl(origin, 'hero-800x533.webp')).toBe(
      'https://media.theroyalglow.in/cms/hero-800x533.webp',
    )
  })

  it('uses the full document prefix and encodes object key segments', () => {
    expect(publicMediaFileUrl(origin, 'hero.png', 'cms/gallery images/fixture')).toBe(
      'https://media.theroyalglow.in/cms/gallery%20images/fixture/hero.png',
    )
  })

  it('makes direct public URLs optional and accepts only an HTTPS origin', () => {
    expect(readPublicMediaOrigin(' ')).toBeUndefined()
    expect(readPublicMediaOrigin(`${origin}/`)).toBe(origin)
    expect(() => readPublicMediaOrigin(`${origin}/cms`)).toThrow('must be an HTTPS origin')
    expect(() => readPublicMediaOrigin('http://media.example.invalid')).toThrow(
      'must be an HTTPS origin',
    )
  })
})
