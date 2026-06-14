/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : CustomerLayout
 * Scope        : Customer Pages
 *
 * Description  : Root layout for all customer-facing pages. Renders the
 *                site header, footer, booking dialog, skip-link and announcement bar.
 *
 * Responsibilities :
 * - Provide consistent page chrome (header, footer, skip-link) for customer routes
 * - Mount the BookingDialogProvider so any child can trigger the booking flow
 * - Render the announcement bar for promotions
 *
 * Features / Functionality :
 * - Skip-to-content accessibility link
 * - Announcement bar with seasonal offers
 * - Suspense-wrapped BookingDialogTrigger for deep-link booking
 *
 * Tech Stack   : React, Next.js 16 (App Router), Tailwind CSS v4
 * Layer        : Presentation
 *
 * Dependencies : BookingDialogProvider, BookingDialogTrigger, Footer, Header, React (Suspense)
 *
 * Notes        :
 * - The booking dialog is lazily loaded via Suspense to avoid blocking initial render
 ************************************************************/

import { BookingDialogProvider } from '@/components/booking/BookingDialogProvider'
import { BookingDialogTrigger } from '@/components/booking/BookingDialogTrigger'
import { Footer } from '@/components/layout/Footer'
import { Header } from '@/components/layout/Header'
import { Suspense } from 'react'
import { AnnouncementBar } from './_components/AnnouncementBar'

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return (
    <BookingDialogProvider>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:bg-royal-gold focus:text-cocoa-dark focus:font-ui focus:text-xs focus:uppercase focus:tracking-[0.5px] focus:rounded-full focus:px-4 focus:py-2"
      >
        Skip to content
      </a>

      <AnnouncementBar />

      <Header />
      {/* pt = announcement bar (36px) + header (80px) = 116px */}
      <main id="main-content" className="pt-[116px]">
        {children}
      </main>
      <Footer />
      <Suspense fallback={null}>
        <BookingDialogTrigger />
      </Suspense>
    </BookingDialogProvider>
  )
}
