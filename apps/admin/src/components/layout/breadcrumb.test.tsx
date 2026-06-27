/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : breadcrumb (test)
 * Scope        : Admin UI — App Shell / Top_Bar accessibility
 *
 * Description  : Vitest + React Testing Library + jest-axe accessibility test
 *                for the Breadcrumb component. Verifies the breadcrumb landmark,
 *                ancestor link navigation, and the non-interactive current crumb
 *                for a representative detail sub-route, plus a top-level route.
 *                `usePathname` from next/navigation is mocked so the trail is
 *                deterministic; the real `deriveBreadcrumbs` + ADMIN_NAV config
 *                drive the derivation (integration-level coverage).
 *
 * Responsibilities :
 * - Assert a `<nav aria-label="Breadcrumb">` landmark is present (Req 5.7)
 * - Assert each ancestor crumb is a link to its route href (Req 5.5)
 * - Assert the current crumb carries `aria-current="page"` and is not a link
 *   (Req 5.4)
 * - Assert zero accessibility violations via jest-axe (Req 5.7)
 *
 * Tech Stack   : Vitest, @testing-library/react, jest-axe, jsdom
 * Layer        : Testing (presentation — App Shell)
 *
 * Dependencies : @/components/layout/breadcrumb, next/navigation (mocked)
 *
 * Notes        : Runs under the jsdom `admin` Vitest project. jest-axe matchers
 *                are registered locally via expect.extend(toHaveNoViolations)
 *                so the wiring is idempotent and independent of src/test/setup.
 *
 * Validates: Requirements 5.4, 5.5, 5.7
 ************************************************************/

import { cleanup, render, screen } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Mutable pathname holder, hoisted so the (hoisted) vi.mock factory can read it.
const { mockPathname } = vi.hoisted(() => ({
  mockPathname: { value: '/bookings/123' },
}))

// Mock the App Router client hook so the breadcrumb trail is deterministic.
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname.value,
}))

import { Breadcrumb } from '@/components/layout/breadcrumb'

expect.extend(toHaveNoViolations)

afterEach(cleanup)

describe('Breadcrumb accessibility (Req 5.4, 5.5, 5.7)', () => {
  it('renders a <nav aria-label="Breadcrumb"> landmark (Req 5.7)', () => {
    mockPathname.value = '/bookings/123'
    render(<Breadcrumb />)

    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument()
  })

  it('renders an ancestor crumb as a link to its route href (Req 5.5)', () => {
    mockPathname.value = '/bookings/123'
    render(<Breadcrumb />)

    // The matched ADMIN_NAV section (Bookings) is demoted to a link ancestor
    // pointing at its own route.
    const ancestor = screen.getByRole('link', { name: 'Bookings' })
    expect(ancestor).toHaveAttribute('href', '/bookings')
  })

  it('marks the current crumb aria-current="page" and is not a link (Req 5.4)', () => {
    mockPathname.value = '/bookings/123'
    render(<Breadcrumb />)

    // The trailing detail segment is the current page: non-interactive text
    // marked aria-current="page".
    const current = screen.getByText('123')
    expect(current).toHaveAttribute('aria-current', 'page')

    // It must NOT be a link.
    expect(screen.queryByRole('link', { name: '123' })).not.toBeInTheDocument()
  })

  it('renders a single current-only crumb for a top-level route (Req 5.4)', () => {
    mockPathname.value = '/bookings'
    render(<Breadcrumb />)

    const current = screen.getByText('Bookings')
    expect(current).toHaveAttribute('aria-current', 'page')
    // A top-level route has no ancestor link.
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('has zero accessibility violations (Req 5.7)', async () => {
    mockPathname.value = '/bookings/123'
    const { container } = render(<Breadcrumb />)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
