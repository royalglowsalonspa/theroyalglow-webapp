/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 09-06-2026 & Updated - 09-06-2026
 *
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : app-shell (a11y test)
 * Scope        : Admin — App_Shell layout primitives accessibility
 *
 * Description  : Vitest + React Testing Library + jest-axe accessibility tests
 *                for the redesigned App_Shell layout primitives: the Top_Bar,
 *                the UserIdentity block, and the role-filtered AdminSidebar.
 *                Each is rendered with representative props and asserted to
 *                produce zero axe violations, complementing the existing
 *                Breadcrumb a11y coverage. `next/navigation` and `next/link`
 *                are stubbed so the components render deterministically with no
 *                App Router context, and the network-bound NotificationBell is
 *                stubbed to a no-op.
 *
 * Responsibilities :
 * - Assert `axe(container).toHaveNoViolations()` for TopBar, UserIdentity, and
 *   AdminSidebar with representative props (Req 13.1)
 * - Audit the icon-only / avatar interactive controls so their accessible
 *   names are verified (Req 13.2, 13.3)
 *
 * Tech Stack   : Vitest, @testing-library/react, jest-axe, jsdom
 * Layer        : Testing (presentation — App Shell)
 *
 * Dependencies : @/components/layout/top-bar, @/components/layout/user-identity,
 *                @/components/layout/admin-sidebar, next/navigation (mocked),
 *                next/link (mocked)
 *
 * Notes        : Runs under the jsdom `admin` Vitest project. jest-axe matchers
 *                are registered locally via expect.extend(toHaveNoViolations).
 *                Mocks are local to this file; `usePathname` is pinned so the
 *                breadcrumb + sidebar derive a stable trail, and `next/link` is
 *                rendered as a plain anchor.
 *
 * Validates: Requirements 13.1, 13.2, 13.3, 13.5
 ************************************************************/

import { cleanup, render } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Deterministic route so the breadcrumb + sidebar derive a stable trail.
vi.mock('next/navigation', () => ({
  usePathname: () => '/bookings',
}))

// Render next/link as a plain anchor — avoids needing an App Router context.
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    onClick,
    ...rest
  }: {
    href: string | { pathname?: string }
    children: React.ReactNode
    onClick?: () => void
  }) => (
    <a
      href={typeof href === 'string' ? href : (href?.pathname ?? '#')}
      onClick={(e) => {
        e.preventDefault()
        onClick?.()
      }}
      {...rest}
    >
      {children}
    </a>
  ),
}))

// NotificationBell polls /api/notifications on mount — stub to nothing so the
// Top_Bar renders in jsdom with no network access.
vi.mock('@/components/notifications/notification-bell', () => ({
  NotificationBell: () => null,
}))

import { AdminSidebar } from '@/components/layout/admin-sidebar'
import { TopBar } from '@/components/layout/top-bar'
import { UserIdentity } from '@/components/layout/user-identity'

expect.extend(toHaveNoViolations)

afterEach(cleanup)

describe('TopBar accessibility (Req 13.1, 13.3)', () => {
  it('has zero violations with the toggle, breadcrumb, and user identity', async () => {
    // Props supplied via spread so the domain `role` prop is not authored as a
    // literal JSX `role=` attribute (which the a11y linter treats as an ARIA
    // role rather than a component prop).
    const topBarProps = { userName: 'Asha Rao', role: 'Owner', onToggleSidebar: () => {} }
    const { container } = render(<TopBar {...topBarProps} />)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})

describe('UserIdentity accessibility (Req 13.1, 13.2)', () => {
  it('has zero violations with a labelled avatar control', async () => {
    const identityProps = { userName: 'Asha Rao', role: 'Owner' }
    const { container } = render(<UserIdentity {...identityProps} />)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})

describe('AdminSidebar accessibility (Req 13.1, 13.3)', () => {
  it('has zero violations rendering the role-filtered navigation landmark', async () => {
    // Owner-level (5) surfaces the full nav; the active route is highlighted.
    const { container } = render(<AdminSidebar roleLevel={5} />)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has zero violations for a minimal (Receptionist) role level', async () => {
    const { container } = render(<AdminSidebar roleLevel={1} />)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
