/************************************************************
 * Module Name  : ClosedDayBookingsPanel.test
 * Scope        : Admin Portal — Dashboard (multi-branch R1.8, MS-09)
 *
 * Description  : The panel counts the bookings on days the branch is now
 *                closed, links each to its booking with the closure's name,
 *                says how many more there are, and has no accessibility
 *                violations.
 ************************************************************/

import { cleanup, render, screen, within } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'
import { afterEach, describe, expect, it } from 'vitest'
import type { ClosedDayBookings } from '@/lib/bookings/closed-day-bookings'
import { ClosedDayBookingsPanel } from './ClosedDayBookingsPanel'

expect.extend(toHaveNoViolations)

afterEach(() => {
  cleanup()
})

const item = (n: number) => ({
  bookingId: `bk_${n}`,
  bookingNumber: `BK-RS-2611-H-1000${n}`,
  date: `2026-11-0${n}`,
  startTime: '15:00',
  customerName: `Customer ${n}`,
  closureName: 'Diwali',
})

describe('ClosedDayBookingsPanel', () => {
  it('links each booking with the closure, soonest first', async () => {
    const bookings: ClosedDayBookings = { total: 2, items: [item(1), item(2)] }
    const { container } = render(<ClosedDayBookingsPanel bookings={bookings} />)

    expect(
      screen.getByRole('heading', { name: '2 bookings are on closed days' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/move it to another day or cancel it/)).toBeInTheDocument()
    const items = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    const first = within(items[0] as HTMLElement)
    expect(
      first.getByRole('link', { name: /01\/11\/2026 · 03:00 PM — Customer 1/ }),
    ).toHaveAttribute('href', '/bookings/bk_1')
    expect(first.getByText('(#BK-RS-2611-H-10001)')).toBeInTheDocument()
    expect(first.getByText('Closed: Diwali')).toBeInTheDocument()
    expect(screen.queryByText(/more\./)).toBeNull()
    expect(await axe(container)).toHaveNoViolations()
  })

  it('says one booking in the singular, and how many more there are', () => {
    render(<ClosedDayBookingsPanel bookings={{ total: 1, items: [item(1)] }} />)
    expect(
      screen.getByRole('heading', { name: '1 booking is on a closed day' }),
    ).toBeInTheDocument()

    cleanup()
    render(<ClosedDayBookingsPanel bookings={{ total: 10, items: [item(1), item(2)] }} />)
    expect(screen.getByText('And 8 more.')).toBeInTheDocument()
  })
})
