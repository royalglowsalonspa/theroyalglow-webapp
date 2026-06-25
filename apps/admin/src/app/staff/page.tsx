/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Admin Staff Page
 * Scope        : Admin Portal — Staff management
 *
 * Description  : Server page for the staff roster. Sets metadata and renders
 *                the interactive StaffManager.
 *
 * Tech Stack   : Next.js 16 (App Router), React, TypeScript
 * Layer        : Presentation (Page)
 *
 * Dependencies : next (Metadata), StaffManager
 *
 * Notes        : Manager+ (enforced by edge middleware + API requireRole).
 ************************************************************/

import type { Metadata } from 'next'
import { StaffManager } from './staff-manager'

export const metadata: Metadata = {
  title: 'Staff',
}

export default function StaffPage() {
  return <StaffManager />
}
