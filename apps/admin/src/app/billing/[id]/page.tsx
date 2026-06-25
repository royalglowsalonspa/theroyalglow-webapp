/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Admin Invoice Detail Page
 * Scope        : Admin Portal — Billing
 *
 * Description  : Server page for a single invoice. Resolves the route id and
 *                renders the InvoiceDetail client component.
 *
 * Tech Stack   : Next.js 16 (App Router), React, TypeScript
 * Layer        : Presentation (Page)
 *
 * Dependencies : next (Metadata), InvoiceDetail
 *
 * Notes        : params is a Promise in Next.js 16 — await before use.
 ************************************************************/

import type { Metadata } from 'next'
import { InvoiceDetail } from './invoice-detail'

export const metadata: Metadata = {
  title: 'Invoice',
}

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <InvoiceDetail invoiceId={id} />
}
