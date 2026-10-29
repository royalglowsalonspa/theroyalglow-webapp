/************************************************************
 * Module Name  : ReassignmentPanel.test
 * Scope        : Admin Portal — Dashboard (multi-branch R1.7)
 *
 * Description  : The panel counts the bookings that need someone else, links
 *                each to its booking with the reason, points to the Bookings
 *                page for the rest, and has no accessibility violations.
 ************************************************************/

import { cleanup, render, screen, within } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'
import { afterEach, describe, expect, it } from 'vitest'
import type { ReassignmentWork } from '@/lib/bookings/reassignment-work'
import { ReassignmentPanel } from './ReassignmentPanel'

expect.extend(toHaveNoViolations)

afterEach(() => {
  cleanup()
})

const item = (n: number) => ({
  bookingId: `bk_${n}`,
  bookingNumber: `BK-RS-2611-H-1000${n}`,
  date: '2026-11-0' + String(n),
  startTime: '15:00',
  customerName: `Customer ${n}`,
  reasonText: 'Asha no longer works at this branch.',
})

describe('ReassignmentPanel', () => {
  it('links each booking with the reason', async () => {
    const work: ReassignmentWork = { branchName: 'Rayasandra', total: 2, items: [item(1), item(2)] }
    const { container } = render(<ReassignmentPanel work={work} />)

    expect(
      screen.getByRole('heading', { name: '2 bookings need someone else' }),
    ).toBeInTheDocument()
    const items = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    const first = within(items[0] as HTMLElement)
    expect(
      first.getByRole('link', { name: /01\/11\/2026 · 03:00 PM — Customer 1/ }),
    ).toHaveAttribute('href', '/bookings/bk_1')
    expect(first.getByText('Asha no longer works at this branch.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Bookings' })).toBeNull()
    expect(await axe(container)).toHaveNoViolations()
  })

  it('says one booking in the singular and points to the rest', () => {
    render(<ReassignmentPanel work={{ branchName: 'Rayasandra', total: 1, items: [item(1)] }} />)
    expect(
      screen.getByRole('heading', { name: '1 booking needs someone else' }),
    ).toBeInTheDocument()

    cleanup()
    render(<ReassignmentPanel work={{ branchName: 'Rayasandra', total: 11, items: [item(1)] }} />)
    expect(screen.getByText(/And 10 more on the/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Bookings' })).toHaveAttribute('href', '/bookings')
  })
})
