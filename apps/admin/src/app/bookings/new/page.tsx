/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 29-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : New Walk-in Booking Page
 * Scope        : Admin Portal — Booking Management
 *
 * Description  : Server page for creating a walk-in booking at the counter of
 *                the active branch. Authorizes like an API (fresh role and
 *                branch access), loads the active service catalogue, and hands
 *                the serialisable data to the WalkinForm client component,
 *                which captures the receptionist's input and POSTs it.
 *
 * Responsibilities :
 * - Resolve the active branch (receptionist or above there)
 * - Fetch the active service catalogue (salon + spa) for the service picker
 * - Project it to a lean, serialisable shape for the client form
 * - Render the WalkinForm, or why a walk-in can't be created here
 *
 * Features / Functionality :
 * - The walk-in is booked at the active branch; switch branch to book at
 *   another (multi-branch R2.1, R2.4)
 * - Only an operational branch takes walk-ins (the API enforces this too)
 * - Active catalogue only (inactive services are never bookable)
 *
 * Tech Stack   : Next.js 16 (App Router), React, TypeScript
 * Layer        : Presentation (Page with Server-Side Data Fetching)
 *
 * Dependencies : next (Metadata), @rgss/db queries, branch-page, WalkinForm
 *
 * Notes        :
 * - The create API re-checks the role and the rendered branch.
 * - Server Component — no client-side code here.
 ************************************************************/

import { isOfferedAt } from '@rgss/business'
import { getActiveCatalogue } from '@rgss/db/queries'
import type { Metadata } from 'next'
import { EmptyState } from '@/components/ui/state/empty-state'
import { branchForPage } from '@/lib/api/branch-page'
import { WalkinForm, type WalkinService } from './walkin-form'

export const metadata: Metadata = {
  title: 'New Walk-in Booking',
}

export default async function NewWalkinBookingPage() {
  const access = await branchForPage('receptionist')
  if (!access.ok) {
    return <EmptyState title="Walk-ins aren't available" message={access.message} />
  }
  const { branch } = access
  if (branch.status !== 'operational') {
    return (
      <EmptyState
        title="Walk-ins aren't available"
        message={`${branch.name} is not taking bookings right now.`}
      />
    )
  }

  const catalogue = await getActiveCatalogue()

  // Flatten the grouped catalogue into a lean service list the form filters by
  // service type, keeping only what this branch offers (R4.3; the API refuses
  // the rest). Price + duration drive the running total shown to the user.
  const serviceOptions: WalkinService[] = catalogue.flatMap((category) =>
    category.services
      .filter((s) => isOfferedAt(s.availableBranchIds, branch.id))
      .map((s) => ({
        id: s.id,
        name: s.name,
        serviceType: s.serviceType,
        categoryName: category.name,
        pricePaise: s.pricePaise,
        durationMinutes: s.durationMinutes,
      })),
  )

  return (
    <WalkinForm
      branch={{ id: branch.id, name: branch.name, code: branch.code }}
      services={serviceOptions}
    />
  )
}
