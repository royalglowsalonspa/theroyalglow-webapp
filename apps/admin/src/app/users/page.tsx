/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 25-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Admin Users Page
 * Scope        : Admin Portal — User / RBAC administration
 *
 * Description  : Server page for the owner-facing role assignment screen
 *                (find a person, assign a role). Sets metadata and renders
 *                UsersManager. The full sign-up list lives in /customers.
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
