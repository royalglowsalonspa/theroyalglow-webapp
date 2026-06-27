/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : icon (test)
 * Scope        : Admin — Icon System accessibility
 *
 * Description  : Vitest + React Testing Library + jest-axe accessibility test
 *                for the Icon wrapper. Verifies the redesign's icon a11y
 *                contract: a decorative icon is hidden from assistive
 *                technology, while a labelled icon (the sole content of a
 *                control) is exposed as an image with a non-empty accessible
 *                name.
 *
 * Responsibilities :
 * - Assert a decorative icon is `aria-hidden="true"` and exposes no role/name
 *   (Req 2.4)
 * - Assert a labelled icon is `role="img"` with its `aria-label` accessible
 *   name (Req 2.5)
 * - Assert zero accessibility violations via jest-axe for both shapes
 *
 * Tech Stack   : Vitest, @testing-library/react, jest-axe, jsdom, lucide-react
 * Layer        : Testing (presentation primitive)
 *
 * Dependencies : @/components/ui/icon, lucide-react
 *
 * Notes        : Runs under the jsdom `admin` Vitest project. jest-axe matchers
 *                are registered locally via expect.extend(toHaveNoViolations)
 *                so the wiring is idempotent and independent of src/test/setup.
 *
 * Validates: Requirements 2.4, 2.5
 ************************************************************/

import { cleanup, render, screen } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'
import { Search } from 'lucide-react'
import { afterEach, describe, expect, it } from 'vitest'
import { Icon } from '@/components/ui/icon'

expect.extend(toHaveNoViolations)

afterEach(cleanup)

describe('Icon accessibility (Req 2.4, 2.5)', () => {
  it('hides a decorative icon from assistive technology via aria-hidden (Req 2.4)', () => {
    const { container } = render(<Icon icon={Search} decorative />)

    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
    expect(svg).toHaveAttribute('aria-hidden', 'true')

    // A decorative icon exposes neither a role nor an accessible name.
    expect(svg).not.toHaveAttribute('role', 'img')
    expect(svg).not.toHaveAttribute('aria-label')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('exposes a labelled icon as role="img" with its aria-label name (Req 2.5)', () => {
    render(<Icon icon={Search} label="Search bookings" />)

    const img = screen.getByRole('img', { name: 'Search bookings' })
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute('aria-label', 'Search bookings')
    // A labelled icon must not be hidden from assistive technology.
    expect(img).not.toHaveAttribute('aria-hidden', 'true')
  })

  it('has zero accessibility violations for a decorative icon (Req 2.4)', async () => {
    const { container } = render(<Icon icon={Search} decorative />)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has zero accessibility violations for a labelled icon (Req 2.5)', async () => {
    const { container } = render(<Icon icon={Search} label="Search bookings" />)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
