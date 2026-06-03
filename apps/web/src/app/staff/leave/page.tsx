/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : StaffLeavePage
 * Scope        : Staff Portal
 *
 * Description  : Staff leave request page. Renders the page header and mounts
 *                the StaffLeavePanel client component for leave management.
 *
 * Responsibilities :
 * - Provide page metadata and header for the leave section
 * - Mount the StaffLeavePanel component for form submission and history
 * - Keep the server component lightweight with no data fetching
 *
 * Features / Functionality :
 * - Static page metadata (title + description)
 * - Clean header with eyebrow label and heading
 * - Delegates all interactivity to StaffLeavePanel client component
 *
 * Tech Stack   : React, Next.js 16 (App Router), Tailwind CSS v4
 * Layer        : Presentation
 *
 * Dependencies : next (Metadata), StaffLeavePanel
 *
 * Notes        :
 * - Leave data is fetched client-side within StaffLeavePanel
 ************************************************************/

import type { Metadata } from 'next'
import { StaffLeavePanel } from './staff-leave-panel'

export const metadata: Metadata = {
  title: 'My Leave',
  description: 'Request leave and review your leave history at Royal Glow.',
}

export default function StaffLeavePage() {
  return (
    <div>
      <header className="mb-8">
        <p className="font-ui text-[11px] uppercase tracking-[2px] text-warm-stone mb-2">
          Time off
        </p>
        <h1 className="font-display text-[clamp(28px,5vw,40px)] text-cocoa-dark tracking-tight leading-[1.05]">
          My Leave
        </h1>
      </header>

      <StaffLeavePanel />
    </div>
  )
}
