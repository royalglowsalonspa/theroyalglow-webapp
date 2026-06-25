/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Admin Users Page
 * Scope        : Admin Portal — User / RBAC administration
 *
 * Description  : Server page for the owner-facing user directory and role
 *                assignment screen. Sets metadata and renders UsersManager.
 *
 * Responsibilities :
 * - Define page-level metadata (title: "Users")
 * - Render the UsersManager component as page content
 * - Serve as the route entry point for /users (owner+ via middleware/RBAC)
 *
 * Tech Stack   : Next.js 16 (App Router), React, TypeScript
 * Layer        : Presentation (Page)
 *
 * Dependencies : next (Metadata), UsersManager component
 *
 * Notes        : Server Component — interactivity lives in UsersManager.
 ************************************************************/

import type { Metadata } from 'next'
import { UsersManager } from './users-manager'

export const metadata: Metadata = {
  title: 'Users',
}

export default function UsersPage() {
  return <UsersManager />
}
