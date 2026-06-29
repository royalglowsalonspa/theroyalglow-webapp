import { Feedback } from '@/components/feedback'
import { LegacyBanner } from '@/components/legacy-banner'
import { NotFoundContent } from '@/components/not-found-content'
import { PageAffordances } from '@/components/page-affordances'
import { type SwitcherVersion, VersionSwitcher } from '@/components/version-switcher'
import { render } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Task 12.4 — automated accessibility (axe) gate for the themed docs UI.
//
// Full-page Lighthouse/axe over the rendered, built+served docs site requires a
// real server and is covered by Lighthouse CI (task 12.5). THIS suite is the
// component-level axe gate: each version-aware client/server island is rendered
// in isolation in jsdom with valid props and asserted to have zero axe
// violations. Components that depend on the App Router or the fumadocs search
// context (`NotFoundContent`) are rendered with those contexts mocked, reusing
// the same hoisted-spy pattern as `not-found-content.test.tsx`.
//
// _Requirements: 4.6 (WCAG 2.1 AA)._

expect.extend(toHaveNoViolations)

// `NotFoundContent` recovers the missing path from `usePathname()` and reads the
// fumadocs search context; mock both so it renders standalone in jsdom.
const { usePathnameMock, useSearchContextMock } = vi.hoisted(() => ({
  usePathnameMock: vi.fn<() => string>(),
  useSearchContextMock: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  usePathname: usePathnameMock,
  // VersionSwitcher uses useRouter().push; a no-op router keeps it inert.
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('fumadocs-ui/contexts/search', () => ({
  useSearchContext: useSearchContextMock,
}))

const setOpenSearch = vi.fn()

beforeEach(() => {
  setOpenSearch.mockClear()
  useSearchContextMock.mockReturnValue({ enabled: true, setOpenSearch })
  usePathnameMock.mockReturnValue('/docs/v2/missing')
})

afterEach(() => {
  vi.clearAllMocks()
})

// Most-recent-first registry projection (Latest, then legacy v2) — Req 7.2.
const latest: SwitcherVersion = {
  id: 'latest',
  label: 'Latest',
  versionNumber: null,
  basePath: '/docs',
  isLatest: true,
}
const v2: SwitcherVersion = {
  id: 'v2',
  label: 'v2',
  versionNumber: 2,
  basePath: '/docs/v2',
  isLatest: false,
}

describe('component accessibility — axe (task 12.4, Req 4.6)', () => {
  it('VersionSwitcher has no axe violations', async () => {
    const { container } = render(
      <VersionSwitcher
        activeVersionId="latest"
        targetHrefByVersionId={{ latest: '/docs', v2: '/docs/v2' }}
        versions={[latest, v2]}
      />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })

  it('LegacyBanner has no axe violations', async () => {
    const { container } = render(<LegacyBanner latestHref="/docs" versionLabel="v2" />)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('Feedback has no axe violations', async () => {
    const { container } = render(<Feedback />)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('PageAffordances has no axe violations', async () => {
    const { container } = render(
      <PageAffordances
        lastModified={new Date('2026-06-08')}
        markdownSource={'# Hi'}
        sourceUrl={'https://example.com/x'}
      />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })

  it('NotFoundContent has no axe violations', async () => {
    const { container } = render(<NotFoundContent />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
