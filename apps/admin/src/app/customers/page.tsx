/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Admin Customers Page
 * Scope        : Admin Portal — Customer Management
 *
 * Description  : Server page component for the admin customer
 *                directory. Sets metadata and renders CustomersTable.
 *
 * Responsibilities :
 * - Define page-level metadata (title: "Customers")
 * - Render the CustomersTable component as page content
 * - Serve as the route entry point for /customers
 *
 * Features / Functionality :
 * - Next.js metadata API for tab title
 * - Delegates customer list logic to CustomersTable
 * - Clean separation of server metadata from client interactivity
 *
 * Tech Stack   : Next.js 16 (App Router), React, TypeScript
 * Layer        : Presentation (Page)
 *
 * Dependencies : next (Metadata), CustomersTable component
 *
 * Notes        :
 * - Server Component — no client-side code here
 ************************************************************/

import type { Metadata } from 'next'
import { CustomersTable } from './customers-table'

export const metadata: Metadata = {
  title: 'Customers',
}

export default function CustomersPage() {
  return <CustomersTable />
}
