/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Memberships List
 * Scope        : Admin Portal — Membership Management
 *
 * Description  : Interactive SPA memberships list with tier and
 *                status filtering. Displays hours usage, expiry
 *                countdown, and links to detail/create pages.
 *
 * Responsibilities :
 * - Fetch memberships with tier and status filter params
 * - Render tier/status filter bar with dynamic tier options
 * - Display memberships in a data table with expiry hints
 *
 * Features / Functionality :
 * - Tier and status dropdown filters
 * - Hours used/total display with human-friendly formatting
 * - Expiry countdown labels (days left, expires today, expired)
 *
 * Tech Stack   : Next.js 16, React (Client Component), TypeScript
 * Layer        : Presentation (Data Table Component)
 *
 * Dependencies : StatusBadge, admin memberships lib, next/link, React hooks
 *
 * Notes        :
 * - Tier options are fetched once on mount from /api/membership-tiers
 ************************************************************/

'use client'

import { StatusBadge } from '@/components/admin/StatusBadge'
import {
  MEMBERSHIP_STATUS_OPTIONS,
  type MembershipListRow,
  type MembershipTier,
  daysUntil,
  formatDateDDMMYYYY,
  minutesToHM,
} from '@/lib/admin/memberships'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

export function MembershipsList() {
  const [memberships, setMemberships] = useState<MembershipListRow[] | null>(null)
  const [tiers, setTiers] = useState<MembershipTier[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tier, setTier] = useState('all')
  const [status, setStatus] = useState('all')

  // Tiers populate the filter dropdown; load once.
  useEffect(() => {
    let active = true
    fetch('/api/membership-tiers')
      .then((res) => res.json())
      .then((json) => {
        if (active && json?.success) {
          setTiers(json.data as MembershipTier[])
        }
      })
      .catch(() => {
        /* filter falls back to status-only */
      })
    return () => {
      active = false
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (tier !== 'all') {
        params.set('tier', tier)
      }
      if (status !== 'all') {
        params.set('status', status)
      }
      const qs = params.toString()
      const res = await fetch(`/api/memberships${qs ? `?${qs}` : ''}`)
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? 'Could not load memberships.')
      }
      setMemberships(json.data as MembershipListRow[])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not load memberships.')
    } finally {
      setLoading(false)
    }
  }, [tier, status])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-display text-cocoa-dark tracking-tight">Memberships</h1>
        <Link
          href="/memberships/new"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[6px] bg-cocoa-dark text-canvas-white text-sm font-ui hover:bg-warm-gray transition-colors"
        >
          + Create Membership
        </Link>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-3 p-3 border border-cloud-gray rounded-[6px] bg-cloud-gray/30">
        {/* Tier dropdown */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="tier-filter"
            className="text-[10px] font-ui uppercase tracking-wider text-dusty-gray"
          >
            Tier
          </label>
          <select
            id="tier-filter"
            value={tier}
            onChange={(e) => setTier(e.target.value)}
            className="h-9 px-3 rounded-[6px] border border-outline-gray bg-canvas-white text-sm font-sans text-cocoa-dark focus:outline-none focus:ring-2 focus:ring-deep-gold"
          >
            <option value="all">All</option>
            {tiers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        {/* Status dropdown */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="status-filter"
            className="text-[10px] font-ui uppercase tracking-wider text-dusty-gray"
          >
            Status
          </label>
          <select
            id="status-filter"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-9 px-3 rounded-[6px] border border-outline-gray bg-canvas-white text-sm font-sans text-cocoa-dark focus:outline-none focus:ring-2 focus:ring-deep-gold"
          >
            {MEMBERSHIP_STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table / states */}
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !memberships || memberships.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <div className="border border-cloud-gray rounded-[6px] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-cloud-gray/60">
                    <Th>Membership #</Th>
                    <Th>Customer</Th>
                    <Th>Tier</Th>
                    <Th>Hours</Th>
                    <Th>Status</Th>
                    <Th>Expires</Th>
                    <Th>Actions</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cloud-gray">
                  {memberships.map((m) => (
                    <tr key={m.id} className="hover:bg-cloud-gray/30 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-cocoa-dark whitespace-nowrap">
                        {m.membershipNumber}
                      </td>
                      <td className="px-4 py-3 font-sans text-cocoa-dark whitespace-nowrap">
                        {m.customerName}
                      </td>
                      <td className="px-4 py-3 font-sans text-warm-gray whitespace-nowrap">
                        {m.tierName}
                      </td>
                      <td className="px-4 py-3 font-sans text-warm-gray whitespace-nowrap">
                        {minutesToHM(m.usedHoursMinutes)} / {minutesToHM(m.totalHoursMinutes)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={m.status} />
                      </td>
                      <td className="px-4 py-3 font-sans text-warm-gray whitespace-nowrap">
                        {formatDateDDMMYYYY(m.expiresAt)}
                        {m.status === 'active' ? (
                          <span className="block text-[11px] text-dusty-gray">
                            {expiryHint(m.expiresAt)}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/memberships/${m.id}`}
                          className="text-deep-gold hover:text-cocoa-dark text-sm font-ui transition-colors"
                          aria-label={`View details for membership ${m.membershipNumber}`}
                        >
                          View →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-sm text-dusty-gray font-sans">
            Showing {memberships.length} membership
            {memberships.length === 1 ? '' : 's'}
          </p>
        </>
      )}
    </div>
  )
}

function expiryHint(expiresAt: string): string {
  const days = daysUntil(expiresAt)
  if (days < 0) {
    return 'Expired'
  }
  if (days === 0) {
    return 'Expires today'
  }
  return `${days} day${days === 1 ? '' : 's'} left`
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-left px-4 py-2.5 font-ui text-xs uppercase tracking-wider text-dusty-gray">
      {children}
    </th>
  )
}

function LoadingState() {
  return (
    <output
      className="flex items-center gap-3 border border-cloud-gray rounded-[6px] bg-canvas-white px-5 py-16 justify-center"
      aria-live="polite"
    >
      <Spinner />
      <span className="font-sans text-sm text-dusty-gray">Loading memberships…</span>
    </output>
  )
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <div className="border border-error/40 bg-error/5 rounded-[6px] px-5 py-10 text-center">
      <p className="font-sans text-sm text-error mb-3" role="alert">
        {message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="px-4 py-2 rounded-[6px] bg-cocoa-dark text-canvas-white text-sm font-ui hover:bg-warm-gray transition-colors"
      >
        Try Again
      </button>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="border border-cloud-gray rounded-[6px] bg-canvas-white px-5 py-16 text-center">
      <p className="font-sans text-sm text-cocoa-dark mb-1">No memberships found</p>
      <p className="font-sans text-xs text-dusty-gray">
        Try adjusting the filters, or create a new membership.
      </p>
    </div>
  )
}

function Spinner() {
  return (
    <svg
      className="h-5 w-5 animate-spin text-deep-gold"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  )
}
