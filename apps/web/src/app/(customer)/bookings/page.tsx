/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : BookingsPage
 * Scope        : Booking Management
 *
 * Description  : Customer-facing "My Bookings" page. Displays the page header
 *                and mounts the BookingsList client component for fetching/managing bookings.
 *
 * Responsibilities :
 * - Render the page header and metadata for the bookings page
 * - Mount the BookingsList component which handles data fetching and interactions
 * - Ensure the page is not indexed by search engines (private user data)
 *
 * Features / Functionality :
 * - Static metadata with robots noindex/nofollow
 * - Clean page header with eyebrow label
 * - Delegated booking list rendering to client component
 *
 * Tech Stack   : React, Next.js 16 (App Router), Tailwind CSS v4
 * Layer        : Presentation
 *
 * Dependencies : next (Metadata), BookingsList
 *
 * Notes        :
 * - This is a server component that delegates interactivity to BookingsList
 ************************************************************/

import type { Metadata } from 'next'
import { BookingsList } from './bookings-list'

export const metadata: Metadata = {
  title: 'My Bookings',
  description: 'View and manage your Royal Glow appointments.',
  robots: { index: false, follow: false },
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
