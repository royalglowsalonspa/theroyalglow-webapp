/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Admin Layout
 * Scope        : Admin Portal — Layout & Metadata
 *
 * Description  : Root layout for the admin portal. Sets page
 *                metadata template and disables search engine indexing.
 *
 * Responsibilities :
 * - Define admin-wide metadata title template
 * - Set robots noindex/nofollow to prevent crawling
 * - Wrap all admin pages in the AdminShell component
 *
 * Features / Functionality :
 * - Next.js metadata API for SEO control
 * - Title template pattern (%s | Admin | Royal Glow)
 * - Single layout wrapper for consistent admin chrome
 *
 * Tech Stack   : Next.js 16 (App Router), React, TypeScript
 * Layer        : Presentation (Layout)
 *
 * Dependencies : next (Metadata), AdminShell component
 *
 * Notes        :
 * - This is a Server Component (no 'use client' directive)
 ************************************************************/

import type { Metadata } from 'next'
import { AdminShell } from './admin-shell'

export const metadata: Metadata = {
  title: {
    template: '%s | Admin | Royal Glow',
    default: 'Admin | Royal Glow',
  },
  robots: { index: false, follow: false },
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <AdminShell>{children}</AdminShell>
}
