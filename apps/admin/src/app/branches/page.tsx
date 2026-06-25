/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Admin Branches Page
 * Scope        : Admin Portal — Branch management
 *
 * Description  : Server page for managing physical salon/spa branches (list,
 *                create, edit, status changes). Multi-branch-ready. Renders the
 *                BranchesManager client component.
 *
 * Tech Stack   : Next.js 16 (App Router), React, TypeScript
 * Layer        : Presentation (Page)
 *
 * Dependencies : next (Metadata), BranchesManager
 *
 * Notes        : Owner+ (edge middleware + API requireRole('owner')).
 ************************************************************/

import type { Metadata } from 'next'
import { BranchesManager } from './branches-manager'

export const metadata: Metadata = {
  title: 'Branches',
}

export default function BranchesPage() {
  return <BranchesManager />
}
