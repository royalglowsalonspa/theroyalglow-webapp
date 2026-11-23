import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveMedia } from './media'

afterEach(() => vi.unstubAllEnvs())

describe('resolveMedia', () => {
  it('keeps an absolute URL on the prior media host', () => {
    vi.stubEnv('NEXT_PUBLIC_R2_PUBLIC_URL', 'https://media.theroyalglow.in')
    const url = 'https://r2.theroyalglow.in/cms/legacy.webp'
    expect(resolveMedia({ url })?.url).toBe(url)
  })

  it('resolves media object keys through the new R2 origin', () => {
    vi.stubEnv('NEXT_PUBLIC_R2_PUBLIC_URL', 'https://media.theroyalglow.in/')
    expect(resolveMedia({ url: '/cms/current.webp' })?.url).toBe(
      'https://media.theroyalglow.in/cms/current.webp',
    )
  })

  it('sends relative Payload media routes to Payload even with R2 configured', () => {
    vi.stubEnv('NEXT_PUBLIC_R2_PUBLIC_URL', 'https://media.theroyalglow.in')
    vi.stubEnv('NEXT_PUBLIC_CMS_URL', 'https://cms.theroyalglow.in')
    expect(resolveMedia({ url: '/api/media/file/current.webp?prefix=cms' })?.url).toBe(
      'https://cms.theroyalglow.in/api/media/file/current.webp?prefix=cms',
    )
  })
})
