/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 30-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Customer Profile Page
 * Scope        : Admin Portal — Customer Management
 *
 * Description  : Server-rendered customer profile page with KPIs,
 *                tag management, history/invoice/membership tabs, and
 *                notes, as the active branch sees a customer every Royal
 *                Glow branch shares.
 *
 * Responsibilities :
 * - Authorize like the API (receptionist or above at the active branch)
 * - Load the same projection as GET /api/customers/[id]
 * - Render KPI cards and hand serialisable data to the client tabs
 *
 * Features / Functionality :
 * - Shared identity, visits, no-shows, tags, gems and memberships
 * - LTV, average spend, bookings and invoices for the active branch only
 *   (multi-branch R3.2); other branches' visits as date, branch and services
 * - Interactive tab panel via CustomerProfileTabs client component
 *
 * Tech Stack   : Next.js 16 (App Router), React, TypeScript, Drizzle ORM
 * Layer        : Presentation (Page with Server-Side Data Fetching)
 *
 * Dependencies : @rgss/db queries, branch-page, customer-detail,
 *                CustomerProfileTabs, admin bookings lib
 *
 * Notes        :
 * - Data is serialized to ISO strings for safe client hydration
 ************************************************************/

import { getAllTags } from '@rgss/db/queries'
import { ArrowLeft, Mail, Phone } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { CustomerProfileTabs } from '@/components/admin/CustomerProfileTabs'
import { Icon } from '@/components/ui/icon'
import { EmptyState } from '@/components/ui/state/empty-state'
import { formatDateDDMMYYYY, formatINR } from '@/lib/admin/bookings'
import { branchForPage } from '@/lib/api/branch-page'
import { loadCustomerDetail } from '@/lib/customers/customer-detail'

export const metadata: Metadata = {
  title: 'Customer Profile',
}

type PageProps = {
  params: Promise<{ id: string }>
}

export default async function CustomerProfilePage({ params }: PageProps) {
  const access = await branchForPage('receptionist')
  if (!access.ok) {
    return <EmptyState title="Customer profiles aren't available" message={access.message} />
  }
  const { branch } = access
  const { id } = await params

  const [detail, allTags] = await Promise.all([loadCustomerDetail(id, branch.id), getAllTags()])
  if (!detail) {
    return <NotFoundCard />
  }
  const { customer, branchMoney } = detail

  const tagOptions = allTags.map((t) => ({
    id: t.id,
    slug: t.slug,
    name: t.name,
    color: t.color,
  }))

  return (
    <div className="space-y-5 max-w-5xl">
      <Link
        href="/customers"
        className="inline-flex items-center gap-1.5 text-sm font-ui text-warm-gray hover:text-cocoa-dark transition-colors"
      >
        <Icon icon={ArrowLeft} decorative size={16} /> Back to Customers
      </Link>

      {/* Header */}
      <header className="border border-cloud-gray rounded-cards bg-canvas-white p-5 space-y-1">
        <h1 className="text-2xl font-display text-cocoa-dark tracking-tight">{customer.name}</h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-sans text-warm-gray">
          <span className="inline-flex items-center gap-1.5">
            <Icon icon={Phone} decorative size={14} />
            {customer.phone ?? '—'}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Icon icon={Mail} decorative size={14} />
            {customer.email}
          </span>
          {customer.gender && (
            <span className="capitalize">{customer.gender.replace(/_/g, ' ')}</span>
          )}
          <span>Since {formatDateDDMMYYYY(customer.createdAt)}</span>
        </div>
      </header>

      {/* KPI cards: visits and no-shows cover every branch; money is this branch's */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard label="Visits" value={String(customer.totalVisits)} hint="All branches" />
        <KpiCard label="LTV" value={formatINR(branchMoney.spentPaise)} hint={branch.name} />
        <KpiCard
          label="Avg Spend"
          value={
            branchMoney.averageSpendPaise === null ? '—' : formatINR(branchMoney.averageSpendPaise)
          }
          hint={branch.name}
        />
        <KpiCard label="No-shows" value={String(customer.noshowCount)} hint="All branches" />
        <KpiCard label="Gems" value={String(customer.gemsBalance)} />
      </div>

      {/* Interactive tags + tabbed history (client) */}
      <CustomerProfileTabs
        customerId={id}
        branch={{ id: branch.id, name: branch.name }}
        tags={customer.tags}
        allTags={tagOptions}
        gemsBalance={customer.gemsBalance}
        history={detail.history}
        invoices={detail.invoices}
        membership={detail.membership}
        notes={detail.notes}
      />
    </div>
  )
}

function KpiCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="border border-cloud-gray rounded-cards bg-canvas-white p-4">
      <p className="text-[10px] font-ui uppercase tracking-wider text-dusty-gray mb-1">{label}</p>
      <p className="text-xl font-display text-cocoa-dark">{value}</p>
      {hint ? <p className="mt-1 text-[11px] font-sans text-dusty-gray">{hint}</p> : null}
    </div>
  )
}

function NotFoundCard() {
  return (
    <div className="space-y-4 max-w-5xl">
      <Link
        href="/customers"
        className="inline-flex items-center gap-1.5 text-sm font-ui text-warm-gray hover:text-cocoa-dark transition-colors"
      >
        <Icon icon={ArrowLeft} decorative size={16} /> Back to Customers
      </Link>
      <div className="border border-cloud-gray rounded-cards bg-canvas-white px-5 py-16 text-center">
        <p className="font-sans text-sm text-cocoa-dark mb-1">Customer not found</p>
        <p className="font-sans text-xs text-dusty-gray">
          This customer may have been removed, or the link is incorrect.
        </p>
      </div>
    </div>
  )
}
