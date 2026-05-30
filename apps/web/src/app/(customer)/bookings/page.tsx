import type { Metadata } from 'next'
import { BookingsList } from './bookings-list'

export const metadata: Metadata = {
  title: 'My Bookings',
  description: 'View and manage your Royal Glow appointments.',
}

export default function BookingsPage() {
  return (
    <div className="mx-auto max-w-[800px] px-5 py-10 lg:py-14">
      <header className="mb-8">
        <p className="font-ui text-[11px] uppercase tracking-[2px] text-warm-stone mb-2">
          Your appointments
        </p>
        <h1 className="font-display text-[clamp(32px,5vw,48px)] text-cocoa-dark tracking-tight leading-[1.05]">
          My Bookings
        </h1>
      </header>

      <BookingsList />
    </div>
  )
}
