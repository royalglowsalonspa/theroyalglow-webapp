/************************************************************
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : ui/toaster
 * Scope        : Admin — Sonner toaster mount
 *
 * Description  : Mounts the owned-source shadcn Sonner `Toaster` once in the
 *                admin App Shell. Positioned bottom-right with rich colours so
 *                success/error toasts read against the brand surface. Live-region
 *                semantics and dismiss controls are provided by Sonner; the
 *                `@/lib/admin/toast` helpers drive duration + intent.
 *
 * Tech Stack   : React (Client Component), sonner (via shadcn wrapper)
 * Layer        : Presentation (no I/O, no business logic)
 *
 * Dependencies : @/components/ui/sonner
 *
 * Requirements : 16.5, 16.6, 16.7, 16.8
 ************************************************************/

'use client'

import { Toaster as SonnerToaster } from '@/components/ui/sonner'

/** Single admin toaster, mounted once by the App Shell. */
export function Toaster() {
  return <SonnerToaster position="bottom-right" richColors closeButton />
}
