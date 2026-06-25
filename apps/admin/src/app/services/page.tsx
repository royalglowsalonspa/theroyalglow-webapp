/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Admin Services Page
 * Scope        : Admin Portal — Service & Category management
 *
 * Description  : Server page for the operational service catalogue (the single
 *                source of truth that drives bookings AND the customer
 *                /services page). Renders the ServicesManager.
 *
 * Tech Stack   : Next.js 16 (App Router), React, TypeScript
 * Layer        : Presentation (Page)
 *
 * Dependencies : next (Metadata), ServicesManager
 *
 * Notes        : Manager+ (edge middleware + API requireRole).
 ************************************************************/

import type { Metadata } from 'next'
import { ServicesManager } from './services-manager'

export const metadata: Metadata = {
  title: 'Services',
}

export default function ServicesPage() {
  return <ServicesManager />
}
