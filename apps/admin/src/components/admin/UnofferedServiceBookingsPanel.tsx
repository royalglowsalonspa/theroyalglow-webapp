/************************************************************
 * Module Name  : UnofferedServiceBookingsPanel
 * Scope        : Admin Portal — Dashboard (multi-branch R4.4)
 *
 * Description  : Lists the active branch's bookings still to come with a
 *                service it no longer offers, soonest first, each linking to
 *                its booking. Presentation only: unofferedServiceBookings()
 *                decides.
 ************************************************************/

import { PackageX } from 'lucide-react'
import Link from 'next/link'
import { Icon } from '@/components/ui/icon'
import { formatDateDDMMYYYY, formatTime12h } from '@/lib/admin/bookings'
import type { UnofferedServiceBookings } from '@/lib/bookings/unoffered-service-bookings'

export function UnofferedServiceBookingsPanel({
  bookings,
}: {
  bookings: UnofferedServiceBookings
}) {
  const more = bookings.total - bookings.items.length
  return (
    <section
      aria-labelledby="unoffered-service-bookings-title"
      className="rounded-cards border border-warning/40 bg-warning/10 px-4 py-3"
    >
      <h2
        id="unoffered-service-bookings-title"
        className="flex items-center gap-2 font-ui text-sm text-cocoa-dark"
      >
        <Icon icon={PackageX} decorative size={16} className="text-deep-gold" />
        {bookings.total === 1
          ? `1 booking has a service ${bookings.branchName} no longer offers`
          : `${bookings.total} bookings have a service ${bookings.branchName} no longer offers`}
      </h2>
      <p className="mt-1 font-sans text-sm text-warm-gray">
        The catalogue changed after they were booked. Each can still go ahead as booked; or cancel
        it (reject one that is still pending) and help the customer book at a branch that offers the
        service.
      </p>
      <ul className="mt-2 space-y-1.5">
        {bookings.items.map((item) => (
          <li key={item.bookingId} className="font-sans text-[13px] text-cocoa-dark">
            <Link href={`/bookings/${item.bookingId}`} className="underline underline-offset-2">
              {formatDateDDMMYYYY(item.date)} · {formatTime12h(item.startTime)} —{' '}
              {item.customerName}
            </Link>
            <span className="text-dusty-gray"> (#{item.bookingNumber})</span>
            <span className="block text-warm-gray">Booked: {item.services.join(', ')}</span>
          </li>
        ))}
      </ul>
      {more > 0 ? (
        <p className="mt-2 font-sans text-[13px] text-warm-gray">And {more} more.</p>
      ) : null}
    </section>
  )
}
