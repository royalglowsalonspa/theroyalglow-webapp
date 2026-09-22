import { beforeEach, describe, expect, it, vi } from 'vitest'

const { values, limit } = vi.hoisted(() => ({
  values: vi.fn(() => ({ returning: async () => [] })),
  limit: vi.fn(async () => []),
}))

vi.mock('../index', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit }) }) }),
    insert: () => ({ values }),
  },
}))

import { createService, createServiceCategory } from './services'

beforeEach(() => {
  vi.clearAllMocks()
})

describe.each(['service', 'category'] as const)('%s slug generation', (kind) => {
  it.each([
    ['  Deep Tissue Massage  ', 'deep-tissue-massage'],
    ['---Hair & Nail / Care---', 'hair-nail-care'],
    ['A---B', 'a-b'],
    ['Éclat 123', 'clat-123'],
    ['', 'item'],
    ['--- !!! ---', 'item'],
    [`a${'-'.repeat(100_000)}b`, 'a-b'],
    ['-'.repeat(100_000), 'item'],
  ])('normalizes case %# without changing the slug contract', async (name, slug) => {
    if (kind === 'service') {
      await createService({
        name,
        categoryId: 'category-1',
        durationMinutes: 30,
        pricePaise: 50000,
      })
    } else {
      await createServiceCategory({ name, serviceType: 'spa' })
    }

    expect(values).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ name, slug }))
  })
})
