/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Admin Bookings Page
 * Scope        : Admin Portal — Booking Management
 *
 * Description  : Server page component for the admin bookings list.
 *                Sets metadata and renders the BookingsTable client component.
 *
 * Responsibilities :
 * - Define page-level metadata (title: "Bookings")
 * - Render the BookingsTable component as page content
 * - Serve as the route entry point for /admin/bookings
 *
 * Features / Functionality :
 * - Next.js metadata API for tab title
 * - Delegates all booking list logic to BookingsTable
 * - Clean separation of server metadata from client interactivity
 *
 * Tech Stack   : Next.js 16 (App Router), React, TypeScript
 * Layer        : Presentation (Page)
 *
 * Dependencies : next (Metadata), BookingsTable component
 *
 * Notes        :
 * - Server Component — no client-side code here
 ************************************************************/

import type { Metadata } from 'next'
import { BookingsTable } from './bookings-table'

export const metadata: Metadata = {
  title: 'Bookings',
}

export default function BookingsPage() {
  return <BookingsTable />
}
