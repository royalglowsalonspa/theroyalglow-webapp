/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 10-06-2026 & Updated - 10-06-2026
 *
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : state/empty-state.test
 * Scope        : Component tests for the empty-state State_Presenter
 *
 * Description  : Vitest + @testing-library/react (+ jest-axe) component tests
 *                for the EmptyState presenter. Verifies it renders the title
 *                and the message describing the absence of records for the view
 *                (Req 12.2), that an optional icon is decorative (hidden from
 *                assistive technology), and that it has zero accessibility
 *                violations.
 *
 * Tech Stack   : Vitest, @testing-library/react, jest-axe, jsdom
 * Layer        : Testing (presentation primitive)
 *
 * Dependencies : @/components/ui/state/empty-state
 *
 * Notes        : Runs under the jsdom `admin` Vitest project.
 *
 * Requirements : 12.2
 ************************************************************/

import { cleanup, render, screen } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'
import { CalendarX } from 'lucide-react'
import { afterEach, describe, expect, it } from 'vitest'

import { EmptyState } from '@/components/ui/state/empty-state'

expect.extend(toHaveNoViolations)

afterEach(cleanup)

describe('EmptyState rendering (Req 12.2)', () => {
  it('renders the title and the message describing the absence of records', () => {
    render(
      <EmptyState
        message="No bookings have been made for the selected filters yet."
        title="No bookings yet"
      />,
    )

    expect(screen.getByText('No bookings yet')).toBeInTheDocument()
    expect(
      screen.getByText('No bookings have been made for the selected filters yet.'),
    ).toBeInTheDocument()
  })

  it('renders without an icon when none is supplied', () => {
    const { container } = render(
      <EmptyState message="Nothing to show here." title="All clear" />,
    )

    // No decorative icon is rendered when the icon prop is omitted.
    expect(container.querySelector('svg')).toBeNull()
  })

  it('keeps the optional icon decorative (hidden from assistive technology)', () => {
    const { container } = render(
      <EmptyState icon={CalendarX} message="Nothing here yet." title="No records" />,
    )

    const icon = container.querySelector('svg')
    expect(icon).not.toBeNull()
    expect(icon).toHaveAttribute('aria-hidden', 'true')
  })

  it('has zero accessibility violations', async () => {
    const { container } = render(
      <EmptyState
        icon={CalendarX}
        message="No leads in this pipeline stage."
        title="No leads"
      />,
    )

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
