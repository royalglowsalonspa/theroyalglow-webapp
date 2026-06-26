/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : MeLeavePage (staff self-service)
 * Scope        : Admin Portal — Staff Self-Service
 *
 * Description  : Staff leave request page. Renders the header and mounts the
 *                MeLeavePanel client component for leave management. Relocated
 *                from apps/web/staff/leave during the admin-web-separation feature.
 *
 * Tech Stack   : React, Next.js 16 (App Router)
 * Layer        : Presentation
 *
 * Notes        : Leave data is fetched client-side within MeLeavePanel.
 ************************************************************/

import type { Metadata } from 'next'
import { MeLeavePanel } from './me-leave-panel'

export const metadata: Metadata = {
  title: 'My Leave',
  description: 'Request leave and review your leave history at Royal Glow.',
}

export default function MeLeavePage() {
  return (
    <div className="mx-auto max-w-[960px]">
      <header className="mb-8">
        <p className="font-ui text-[11px] uppercase tracking-[2px] text-warm-stone mb-2">
          Time off
        </p>
        <h1 className="font-display text-[clamp(28px,5vw,40px)] text-cocoa-dark tracking-tight leading-[1.05]">
          My Leave
        </h1>
      </header>

      <MeLeavePanel />
    </div>
  )
}
