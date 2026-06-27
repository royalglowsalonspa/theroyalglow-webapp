/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : New Walk-in Booking Page
 * Scope        : Admin Portal — Booking Management
 *
 * Description  : Server page for creating a walk-in booking at the counter.
 *                Fetches the operational branches and the active service
 *                catalogue server-side (Presentation may read @rgss/db per the
 *                layer rules — same pattern as the customer detail page), then
 *                hands the serialisable data to the WalkinForm client component
 *                which captures the receptionist's input and POSTs it.
 *
 * Responsibilities :
 * - Fetch operational branches for the branch picker
 * - Fetch the active service catalogue (salon + spa) for the service picker
 * - Project both to lean, serialisable shapes for the client form
 * - Render the WalkinForm with that data
 *
 * Features / Functionality :
 * - Only operational branches are offered (a walk-in cannot target a closed
 *   branch — the API enforces this too)
 * - Active catalogue only (inactive services are never bookable)
 * - Next.js metadata for the tab title
 *
 * Tech Stack   : Next.js 16 (App Router), React, TypeScript
 * Layer        : Presentation (Page with Server-Side Data Fetching)
 *
 * Dependencies : next (Metadata), @rgss/db queries, WalkinForm
 *
 * Notes        :
 * - RBAC is enforced at the edge by middleware (the /bookings namespace is
 *   receptionist+); the create API independently re-checks requireRole.
 * - Server Component — no client-side code here.
 ************************************************************/

import { getActiveCatalogue, getBranches } from '@rgss/db/queries'
import type { Metadata } from 'next'
import { type WalkinBranch, WalkinForm, type WalkinService } from './walkin-form'

export const metadata: Metadata = {
  title: 'New Walk-in Booking',
}

export default async function NewWalkinBookingPage() {
  // Fetch in parallel — both reads are independent.
  const [branches, catalogue] = await Promise.all([getBranches(), getActiveCatalogue()])

  // Only operational branches can take a walk-in (the API re-validates this).
  const branchOptions: WalkinBranch[] = branches
    .filter((b) => b.status === 'operational')
    .map((b) => ({ id: b.id, name: b.name, code: b.code }))

  // Flatten the grouped catalogue into a lean service list the form filters by
  // service type. Price + duration drive the running total shown to the user.
  const serviceOptions: WalkinService[] = catalogue.flatMap((category) =>
    category.services.map((s) => ({
      id: s.id,
      name: s.name,
      serviceType: s.serviceType,
      categoryName: category.name,
      pricePaise: s.pricePaise,
      durationMinutes: s.durationMinutes,
    })),
  )

  return <WalkinForm branches={branchOptions} services={serviceOptions} />
}
