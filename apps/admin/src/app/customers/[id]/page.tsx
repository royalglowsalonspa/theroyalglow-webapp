/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Customer Profile Page
 * Scope        : Admin Portal — Customer Management
 *
 * Description  : Server-rendered customer profile page with KPIs,
 *                tag management, booking/invoice/membership history
 *                tabs, and internal notes.
 *
 * Responsibilities :
 * - Fetch customer profile, bookings, invoices, membership, and notes
 * - Compute derived KPIs (LTV, avg spend, gems balance)
 * - Serialize data into plain DTOs for client tabs component
 *
 * Features / Functionality :
 * - Parallel data fetching via Promise.all for performance
 * - KPI cards (visits, LTV, avg spend, no-shows, gems)
 * - Interactive tab panel via CustomerProfileTabs client component
 *
 * Tech Stack   : Next.js 16 (App Router), React, TypeScript, Drizzle ORM
 * Layer        : Presentation (Page with Server-Side Data Fetching)
 *
 * Dependencies : @rgss/db queries, CustomerProfileTabs, admin bookings lib
 *
 * Notes        :
 * - Data is serialized to ISO strings for safe client hydration
 ************************************************************/

import { CustomerProfileTabs } from '@/components/admin/CustomerProfileTabs'
import { Icon } from '@/components/ui/icon'
import { formatDateDDMMYYYY, formatINR } from '@/lib/admin/bookings'
import {
  getAllTags,
  getCustomerBookings,
  getCustomerInvoices,
  getCustomerMembership,
  getCustomerNotes,
  getCustomerProfile,
} from '@rgss/db/queries'
import { ArrowLeft, Mail, Phone } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Customer Profile',
}

type PageProps = {
  params: Promise<{ id: string }>
}

// First-page sizes for the server-rendered history tabs.
const HISTORY_LIMIT = 20

// Serialise a nullable Date to a YYYY-MM-DD string the client formatters accept.
function toDateString(value: Date | string | null): string | null {
  if (!value) {
    return null
  }
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  return date.toISOString()
}

export default async function CustomerProfilePage({ params }: PageProps) {
  const { id } = await params

  const profile = await getCustomerProfile(id)
  if (!profile) {
    return <NotFoundCard />
  }

  // Fetch the first page of each history tab + the tag catalogue in parallel.
  const [bookings, invoices, membership, notes, allTags] = await Promise.all([
    getCustomerBookings(id, HISTORY_LIMIT, 0),
    getCustomerInvoices(id, HISTORY_LIMIT, 0),
    getCustomerMembership(id),
    getCustomerNotes(id),
    getAllTags(),
  ])

  const gemsBalance = profile.gemsBalance ?? 0
  const avgSpendPaise =
    profile.totalVisits > 0 ? Math.round(profile.totalSpentPaise / profile.totalVisits) : null
  const sinceDate = toDateString(profile.createdAt)

  // Map query rows → plain, serialisable DTOs for the client tabs component.
  const bookingDtos = bookings.map((b) => ({
    id: b.id,
    bookingNumber: b.bookingNumber,
    serviceType: b.serviceType,
    status: b.status,
    bookingDate: toDateString(b.bookingDate),
    totalAmountPaise: b.totalAmountPaise,
    isMembershipSession: b.isMembershipSession,
  }))

  const invoiceDtos = invoices.map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    invoiceType: inv.invoiceType,
    paymentStatus: inv.paymentStatus,
    totalAmountPaise: inv.totalAmountPaise,
    gemsEarned: inv.gemsEarned,
    createdAt: toDateString(inv.createdAt),
  }))

  const membershipDtos = {
    active: membership.active
      ? {
          id: membership.active.id,
          membershipNumber: membership.active.membershipNumber,
          tierNameSnapshot: membership.active.tierNameSnapshot,
          status: membership.active.status,
          totalHoursMinutes: membership.active.totalHoursMinutes,
          usedHoursMinutes: membership.active.usedHoursMinutes,
          startsAt: toDateString(membership.active.startsAt),
          expiresAt: toDateString(membership.active.expiresAt),
        }
      : null,
    past: membership.past.map((m) => ({
      id: m.id,
      membershipNumber: m.membershipNumber,
      tierNameSnapshot: m.tierNameSnapshot,
      status: m.status,
      totalHoursMinutes: m.totalHoursMinutes,
      usedHoursMinutes: m.usedHoursMinutes,
      startsAt: toDateString(m.startsAt),
      expiresAt: toDateString(m.expiresAt),
    })),
  }

  const noteDtos = notes.map((n) => ({
    id: n.id,
    content: n.content,
    authorName: n.authorName,
    createdAt: toDateString(n.createdAt),
  }))

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
      <header className="border border-cloud-gray rounded-[6px] bg-canvas-white p-5 space-y-1">
        <h1 className="text-2xl font-display text-cocoa-dark tracking-tight">{profile.name}</h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-sans text-warm-gray">
          <span className="inline-flex items-center gap-1.5">
            <Icon icon={Phone} decorative size={14} />
            {profile.phone ?? '—'}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Icon icon={Mail} decorative size={14} />
            {profile.email}
          </span>
          {profile.gender && (
            <span className="capitalize">{profile.gender.replace(/_/g, ' ')}</span>
          )}
          <span>Since {sinceDate ? formatDateDDMMYYYY(sinceDate) : '—'}</span>
        </div>
      </header>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard label="Visits" value={String(profile.totalVisits)} />
        <KpiCard label="LTV" value={formatINR(profile.totalSpentPaise)} />
        <KpiCard
          label="Avg Spend"
          value={avgSpendPaise === null ? '—' : formatINR(avgSpendPaise)}
        />
        <KpiCard label="No-shows" value={String(profile.noshowCount)} />
        <KpiCard label="Gems" value={String(gemsBalance)} />
      </div>

      {/* Interactive tags + tabbed history (client) */}
      <CustomerProfileTabs
        customerId={id}
        tags={profile.tags}
        allTags={tagOptions}
        gemsBalance={gemsBalance}
        bookings={bookingDtos}
        invoices={invoiceDtos}
        membership={membershipDtos}
        notes={noteDtos}
      />
    </div>
  )
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-cloud-gray rounded-[6px] bg-canvas-white p-4">
      <p className="text-[10px] font-ui uppercase tracking-wider text-dusty-gray mb-1">{label}</p>
      <p className="text-xl font-display text-cocoa-dark">{value}</p>
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
      <div className="border border-cloud-gray rounded-[6px] bg-canvas-white px-5 py-16 text-center">
        <p className="font-sans text-sm text-cocoa-dark mb-1">Customer not found</p>
        <p className="font-sans text-xs text-dusty-gray">
          This customer may have been removed, or the link is incorrect.
        </p>
      </div>
    </div>
  )
}
