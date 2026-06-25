/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 25-06-2026 & Updated - 25-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : BookingDetailPage
 * Scope        : Booking Management
 *
 * Description  : Customer-facing booking detail page. Renders the page shell and
 *                mounts the BookingDetail client component which fetches the
 *                booking, shows a status timeline, and offers cancel/reschedule.
 *
 * Responsibilities :
 * - Resolve the booking id from the (Promise) route params
 * - Render private-page metadata (noindex) and a back link
 * - Delegate data fetching + interactivity to the client component
 *
 * Features / Functionality :
 * - Static metadata with robots noindex/nofollow (private user data)
 * - Back link to the bookings list
 *
 * Tech Stack   : React, Next.js 16 (App Router), Tailwind CSS v4
 * Layer        : Presentation
 *
 * Dependencies : next (Metadata), next/link, ./booking-detail
 *
 * Notes        : params is a Promise in Next.js 16 — await before use.
 ************************************************************/

import type { Metadata } from 'next'
import Link from 'next/link'
import { BookingDetail } from './booking-detail'

export const metadata: Metadata = {
  title: 'Booking Details',
  description: 'View and manage a Royal Glow appointment.',
  robots: { index: false, follow: false },
}

type PageProps = {
  params: Promise<{ id: string }>
}

export default async function BookingDetailPage({ params }: PageProps) {
  const { id } = await params

  return (
    <div className="mx-auto max-w-[800px] px-5 py-10 lg:py-14">
      <Link
        href="/bookings"
        className="font-ui text-[12px] uppercase tracking-[0.5px] text-warm-gray hover:text-cocoa-dark motion-safe:transition-colors duration-200"
      >
        ← Back to My Bookings
      </Link>

      <BookingDetail id={id} />
    </div>
  )
}
