/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : NoStaffProfileEmpty (staff self-service)
 * Scope        : Admin Portal — Staff Self-Service
 *
 * Description  : Client wrapper around EmptyState for the "no staff profile"
 *                state on the My Schedule page. Exists because EmptyState is a
 *                Client Component and a lucide icon (component function) cannot
 *                be passed across the Server→Client boundary in React 19 RSC.
 *                Owning the icon reference here keeps it client-side.
 *
 * Tech Stack   : React, lucide-react
 * Layer        : Presentation (primitive, no I/O, no business logic)
 ************************************************************/

'use client'

import { UserX } from 'lucide-react'
import { EmptyState } from '@/components/ui/state/empty-state'

/** "No staff profile linked" empty state for the staff My Schedule page. */
export function NoStaffProfileEmpty() {
  return (
    <EmptyState
      icon={UserX}
      title="No staff profile found"
      message="Your account isn't linked to a staff profile yet. Ask your manager to set this up so your schedule and leave appear here."
    />
  )
}
