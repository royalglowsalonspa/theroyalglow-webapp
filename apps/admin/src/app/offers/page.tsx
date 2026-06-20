/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Admin Offers Page
 * Scope        : Admin Portal — Offer Management
 *
 * Description  : Server page for the offers management section.
 *                Sets metadata and renders the OffersManager component.
 *
 * Responsibilities :
 * - Define page-level metadata (title: "Offers")
 * - Render the OffersManager component as page content
 * - Serve as the route entry point for /offers
 *
 * Features / Functionality :
 * - Next.js metadata API for tab title
 * - Delegates CRUD offer management to OffersManager
 * - Clean separation of server metadata from client interactivity
 *
 * Tech Stack   : Next.js 16 (App Router), React, TypeScript
 * Layer        : Presentation (Page)
 *
 * Dependencies : next (Metadata), OffersManager component
 *
 * Notes        :
 * - Server Component — CRUD logic lives in OffersManager
 ************************************************************/

import type { Metadata } from 'next'
import { OffersManager } from './offers-manager'

export const metadata: Metadata = {
  title: 'Offers',
}

export default function OffersPage() {
  return <OffersManager />
}
