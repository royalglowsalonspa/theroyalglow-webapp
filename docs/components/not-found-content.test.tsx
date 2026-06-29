import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NotFoundContent } from './not-found-content'

// `not-found.tsx` recovers the missing path from `usePathname()` and reads the
// fumadocs search context. Mock both with hoisted spies so each case can set the
// pathname and search availability independently. `classifyNotFoundContext` is
// the real implementation from `@/lib/versions` (v2 registered, v9 not).
const { usePathnameMock, useSearchContextMock } = vi.hoisted(() => ({
  usePathnameMock: vi.fn<() => string>(),
  useSearchContextMock: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  usePathname: usePathnameMock,
}))
vi.mock('fumadocs-ui/contexts/search', () => ({
  useSearchContext: useSearchContextMock,
}))

const setOpenSearch = vi.fn()

beforeEach(() => {
  setOpenSearch.mockClear()
  useSearchContextMock.mockReturnValue({ enabled: true, setOpenSearch })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('NotFoundContent (task 9.5)', () => {
  it('always links to the latest docs and shows a 404 indicator (Req 15.1, 15.2)', () => {
    usePathnameMock.mockReturnValue('/docs/missing')
    render(<NotFoundContent />)

    expect(screen.getByText('404')).toBeInTheDocument()
    const latestLink = screen.getByRole('link', { name: /latest documentation/i })
    expect(latestLink).toHaveAttribute('href', '/docs')
  })

  it('exposes a search button that opens the search dialog when search is enabled (Req 15.3)', async () => {
    const user = userEvent.setup()
    usePathnameMock.mockReturnValue('/docs/missing')
    render(<NotFoundContent />)

    const searchButton = screen.getByRole('button', { name: /search the docs/i })
    await user.click(searchButton)
    expect(setOpenSearch).toHaveBeenCalledWith(true)
  })

  it('omits the search button when search is disabled (Req 15.3)', () => {
    useSearchContextMock.mockReturnValue({ enabled: false, setOpenSearch })
    usePathnameMock.mockReturnValue('/docs/missing')
    render(<NotFoundContent />)

    expect(screen.queryByRole('button', { name: /search the docs/i })).not.toBeInTheDocument()
    // The /docs link remains the recovery path.
    expect(screen.getByRole('link', { name: /latest documentation/i })).toHaveAttribute(
      'href',
      '/docs',
    )
  })

  it('reflects a missing page within a registered version (Req 15.4)', () => {
    usePathnameMock.mockReturnValue('/docs/v2/missing')
    render(<NotFoundContent />)

    // page-not-found-in-version → names the v2 version label.
    expect(screen.getByRole('heading', { name: /not found in v2/i })).toBeInTheDocument()
    expect(screen.getByText(/v2 documentation/i)).toBeInTheDocument()
  })

  it('reflects an unknown version request (Req 15.4)', () => {
    usePathnameMock.mockReturnValue('/docs/v9/x')
    render(<NotFoundContent />)

    // version-not-found → states the /v9 version itself does not exist.
    expect(screen.getByRole('heading', { name: /version not found/i })).toBeInTheDocument()
    expect(screen.getByText(/\/v9/)).toBeInTheDocument()
  })

  it('shows the generic message for a no-prefix path (Req 15.4)', () => {
    usePathnameMock.mockReturnValue('/docs/missing')
    render(<NotFoundContent />)

    expect(screen.getByRole('heading', { name: /^page not found$/i })).toBeInTheDocument()
  })
})
