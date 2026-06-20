/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Booking Detail Page
 * Scope        : Admin Portal — Booking Management
 *
 * Description  : Server page for individual booking detail view.
 *                Extracts booking ID from dynamic route params and
 *                renders the BookingDetail client component.
 *
 * Responsibilities :
 * - Await dynamic route params (Next.js 16 Promise API)
 * - Set page-level metadata (title: "Booking Detail")
 * - Pass bookingId to the BookingDetail client component
 *
 * Features / Functionality :
 * - Dynamic route [id] parameter extraction
 * - Next.js metadata for page title
 * - Clean server/client boundary separation
 *
 * Tech Stack   : Next.js 16 (App Router), React, TypeScript
 * Layer        : Presentation (Page)
 *
 * Dependencies : next (Metadata), BookingDetail component
 *
 * Notes        :
 * - params is a Promise in Next.js 16 — must be awaited
 ************************************************************/

import type { Metadata } from 'next'
import { BookingDetail } from './booking-detail'

export const metadata: Metadata = {
  title: 'Booking Detail',
}

type PageProps = {
  params: Promise<{ id: string }>
}

export default async function BookingDetailPage({ params }: PageProps) {
  const { id } = await params
  return <BookingDetail bookingId={id} />
}
