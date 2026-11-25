import { render, screen } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/cms/client', () => ({ getActiveOffers: vi.fn().mockResolvedValue([]) }))
vi.mock('@/components/ui/motion/reveal', () => ({
  Reveal: ({ children }: PropsWithChildren) => children,
  RevealGroup: ({ children }: PropsWithChildren) => children,
  RevealItem: ({ children }: PropsWithChildren) => children,
}))

import { OffersSection } from '../_components/OffersSection'
import OffersPage from './page'

describe('when there are no published offers', () => {
  it('hides the homepage offers section', async () => {
    expect(await OffersSection()).toBeNull()
  })

  it('shows the offers page empty state', async () => {
    render(await OffersPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByText('There are no current offers. Check back soon.')).toBeInTheDocument()
    expect(screen.queryByText('20% OFF All Facials', { exact: false })).not.toBeInTheDocument()
  })
})
