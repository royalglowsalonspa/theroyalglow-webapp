/************************************************************
 * Module Name  : UnofferedServiceBookingsPanel.test
 * Scope        : Admin Portal — Dashboard (multi-branch R4.4)
 *
 * Description  : The panel counts the bookings with a service the branch no
 *                longer offers, links each to its booking with the services
 *                booked, says how many more there are, and has no
 *                accessibility violations.
 ************************************************************/

import { cleanup, render, screen, within } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'
import { afterEach, describe, expect, it } from 'vitest'
import type { UnofferedServiceBookings } from '@/lib/bookings/unoffered-service-bookings'
import { UnofferedServiceBookingsPanel } from './UnofferedServiceBookingsPanel'

expect.extend(toHaveNoViolations)

afterEach(() => {
  cleanup()
})

const item = (n: number) => ({
  bookingId: `bk_${n}`,
  bookingNumber: `BK-MH-2611-S-1000${n}`,
  date: `2026-11-0${n}`,
  startTime: '15:00',
  customerName: `Customer ${n}`,
  services: ['Hot Stone 90', 'Potli 60'],
})

describe('UnofferedServiceBookingsPanel', () => {
  it('links each booking with the services booked', async () => {
    const bookings: UnofferedServiceBookings = {
      branchName: 'Marathahalli',
      total: 2,
      items: [item(1), item(2)],
    }
    const { container } = render(<UnofferedServiceBookingsPanel bookings={bookings} />)

    expect(
      screen.getByRole('heading', {
        name: '2 bookings have a service Marathahalli no longer offers',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText(/can still go ahead as booked/)).toBeInTheDocument()
    const items = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    const first = within(items[0] as HTMLElement)
    expect(
      first.getByRole('link', { name: /01\/11\/2026 · 03:00 PM — Customer 1/ }),
    ).toHaveAttribute('href', '/bookings/bk_1')
    expect(first.getByText('Booked: Hot Stone 90, Potli 60')).toBeInTheDocument()
    expect(await axe(container)).toHaveNoViolations()
  })

  it('says one booking in the singular, and how many more there are', () => {
    render(
      <UnofferedServiceBookingsPanel
        bookings={{ branchName: 'Rayasandra', total: 1, items: [item(1)] }}
      />,
    )
    expect(
      screen.getByRole('heading', { name: '1 booking has a service Rayasandra no longer offers' }),
    ).toBeInTheDocument()

    cleanup()
    render(
      <UnofferedServiceBookingsPanel
        bookings={{ branchName: 'Rayasandra', total: 9, items: [item(1)] }}
      />,
    )
    expect(screen.getByText('And 8 more.')).toBeInTheDocument()
  })
})
