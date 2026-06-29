/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : MeIndex (staff self-service entry)
 * Scope        : Admin Portal — Staff Self-Service
 *
 * Description  : Index route for the `/me` self-service namespace. The area has
 *                no standalone landing of its own (it is composed of
 *                `/me/schedule` and `/me/leave`), so `/me` would otherwise 404.
 *                The top-bar user menu's "Account" link points at `/me`; this
 *                page resolves it by redirecting to the primary self-service
 *                view, `/me/schedule`.
 *
 * Tech Stack   : Next.js 16 (App Router), React (Server Component)
 * Layer        : Presentation (redirect-only)
 *
 * Notes        : Access is gated by the admin middleware (min role 'staff' for
 *                `/me/*`) and the `/me` layout's server-side session fallback.
 ************************************************************/

import { redirect } from 'next/navigation'

export default function MeIndexPage() {
  redirect('/me/schedule')
}
