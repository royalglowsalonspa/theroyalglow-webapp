/************************************************************
 * Module Name  : ReassignmentPanel
 * Scope        : Admin Portal — Dashboard (multi-branch R1.7)
 *
 * Description  : Lists the active branch's confirmed bookings that need
 *                someone else, soonest first, each linking to its booking
 *                where reception assigns a person. Presentation only:
 *                reassignmentWork() decides.
 ************************************************************/

import { TriangleAlert } from 'lucide-react'
import Link from 'next/link'
import { Icon } from '@/components/ui/icon'
import { formatDateDDMMYYYY, formatTime12h } from '@/lib/admin/bookings'
import type { ReassignmentWork } from '@/lib/bookings/reassignment-work'

export function ReassignmentPanel({ work }: { work: ReassignmentWork }) {
  const more = work.total - work.items.length
  return (
    <section
      aria-labelledby="reassignment-work-title"
      className="rounded-cards border border-warning/40 bg-warning/10 px-4 py-3"
    >
      <h2
        id="reassignment-work-title"
        className="flex items-center gap-2 font-ui text-sm text-cocoa-dark"
      >
        <Icon icon={TriangleAlert} decorative size={16} className="text-deep-gold" />
        {work.total === 1
          ? '1 booking needs someone else'
          : `${work.total} bookings need someone else`}
      </h2>
      <p className="mt-1 font-sans text-sm text-warm-gray">
        Their assignee can no longer take them. Open each booking to assign someone; the customer’s
        booking is unchanged.
      </p>
      <ul className="mt-2 space-y-1.5">
        {work.items.map((item) => (
          <li key={item.bookingId} className="font-sans text-[13px] text-cocoa-dark">
            <Link href={`/bookings/${item.bookingId}`} className="underline underline-offset-2">
              {formatDateDDMMYYYY(item.date)} · {formatTime12h(item.startTime)} —{' '}
              {item.customerName}
            </Link>
            <span className="text-dusty-gray"> (#{item.bookingNumber})</span>
            <span className="block text-warm-gray">{item.reasonText}</span>
          </li>
        ))}
      </ul>
      {more > 0 ? (
        <p className="mt-2 font-sans text-[13px] text-warm-gray">
          And {more} more on the{' '}
          <Link href="/bookings" className="underline underline-offset-2">
            Bookings
          </Link>{' '}
          page, marked “Needs staff”.
        </p>
      ) : null}
    </section>
  )
}
