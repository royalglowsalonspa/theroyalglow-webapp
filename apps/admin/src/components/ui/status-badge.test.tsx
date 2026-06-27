/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : status-badge (test)
 * Scope        : Admin — Status Badge primitive component test
 *
 * Description  : Vitest + React Testing Library component test for the
 *                StatusBadge primitive. Verifies the rendered text label is the
 *                accessible content (the colour dot is hidden from assistive
 *                technology), so colour is never the sole signal, and that an
 *                unknown / empty status falls back to the neutral "Unknown"
 *                placeholder. A jest-axe zero-violations assertion guards the
 *                badge's accessibility structure.
 *
 * Responsibilities :
 * - Assert snake_case status renders as a Title Case label (Req 9.1)
 * - Assert the colour dot is aria-hidden so the label is the accessible
 *   content (colour never the sole signal) (Req 9.6)
 * - Assert unknown / empty status renders the neutral "Unknown" label (Req 9.4)
 * - Assert zero accessibility violations via jest-axe (Req 9.6)
 *
 * Tech Stack   : Vitest, @testing-library/react, jest-axe, jsdom
 * Layer        : Testing (presentation primitive)
 *
 * Dependencies : @/components/ui/status-badge
 *
 * Notes        : Runs under the jsdom `admin` Vitest project. jest-axe matchers
 *                are registered locally via expect.extend(toHaveNoViolations).
 ************************************************************/

import { cleanup, render, screen } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'
import { afterEach, describe, expect, it } from 'vitest'
import { StatusBadge } from '@/components/ui/status-badge'

expect.extend(toHaveNoViolations)

afterEach(cleanup)

describe('StatusBadge rendering (Req 9.1, 9.6)', () => {
  it('renders a snake_case status as a Title Case label (Req 9.1, 9.3)', () => {
    render(<StatusBadge status="in_progress" />)

    expect(screen.getByText('In Progress')).toBeInTheDocument()
  })

  it('marks the colour dot aria-hidden so the text label is the accessible content (Req 9.6)', () => {
    const { container } = render(<StatusBadge status="confirmed" />)

    // The colour dot must be hidden from assistive technology, so colour is
    // never the sole signal — the visible text label carries the meaning.
    const dot = container.querySelector('[aria-hidden="true"]')
    expect(dot).toBeInTheDocument()

    // The label text is present as the accessible content of the badge.
    const badge = screen.getByText('Confirmed')
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveTextContent('Confirmed')
  })

  it('falls back to the neutral "Unknown" label for an unknown status (Req 9.4)', () => {
    render(<StatusBadge status="not_a_real_status" />)

    // Unknown statuses still render their supplied value as a Title Case label.
    expect(screen.getByText('Not A Real Status')).toBeInTheDocument()
  })

  it('renders the "Unknown" placeholder for an empty status (Req 9.4)', () => {
    render(<StatusBadge status="" />)

    expect(screen.getByText('Unknown')).toBeInTheDocument()
  })

  it('renders the "Unknown" placeholder for a null status (Req 9.4)', () => {
    render(<StatusBadge status={null} />)

    expect(screen.getByText('Unknown')).toBeInTheDocument()
  })

  it('has zero accessibility violations (Req 9.6)', async () => {
    const { container } = render(<StatusBadge status="completed" />)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
