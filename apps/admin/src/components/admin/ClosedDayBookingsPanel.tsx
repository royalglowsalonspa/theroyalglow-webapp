/************************************************************
 * Module Name  : ClosedDayBookingsPanel
 * Scope        : Admin Portal — Dashboard (multi-branch R1.8, MS-09)
 *
 * Description  : Lists the active branch's bookings on days it is now
 *                closed, soonest first, each linking to its booking, where
 *                reception moves or cancels it. Presentation only:
 *                closedDayBookings() decides.
 ************************************************************/

import { CalendarOff } from 'lucide-react'
import Link from 'next/link'
import { Icon } from '@/components/ui/icon'
import { formatDateDDMMYYYY, formatTime12h } from '@/lib/admin/bookings'
import type { ClosedDayBookings } from '@/lib/bookings/closed-day-bookings'

export function ClosedDayBookingsPanel({ bookings }: { bookings: ClosedDayBookings }) {
  const more = bookings.total - bookings.items.length
  return (
    <section
      aria-labelledby="closed-day-bookings-title"
      className="rounded-cards border border-warning/40 bg-warning/10 px-4 py-3"
    >
      <h2
        id="closed-day-bookings-title"
        className="flex items-center gap-2 font-ui text-sm text-cocoa-dark"
      >
        <Icon icon={CalendarOff} decorative size={16} className="text-deep-gold" />
        {bookings.total === 1
          ? '1 booking is on a closed day'
          : `${bookings.total} bookings are on closed days`}
      </h2>
      <p className="mt-1 font-sans text-sm text-warm-gray">
        The branch is closed then. Open each booking to move it to another day or cancel it (reject
        one that is still pending), and let the customer know.
      </p>
      <ul className="mt-2 space-y-1.5">
        {bookings.items.map((item) => (
          <li key={item.bookingId} className="font-sans text-[13px] text-cocoa-dark">
            <Link href={`/bookings/${item.bookingId}`} className="underline underline-offset-2">
              {formatDateDDMMYYYY(item.date)} · {formatTime12h(item.startTime)} —{' '}
              {item.customerName}
            </Link>
            <span className="text-dusty-gray"> (#{item.bookingNumber})</span>
            <span className="block text-warm-gray">Closed: {item.closureName}</span>
          </li>
        ))}
      </ul>
      {more > 0 ? (
        <p className="mt-2 font-sans text-[13px] text-warm-gray">And {more} more.</p>
      ) : null}
    </section>
  )
}
