/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : LeadKanban
 * Scope        : Lead Management UI
 *
 * Description  : Admin lead pipeline kanban board with 5 columns, lead cards,
 *                stale indicators, and a manual lead creation dialog.
 *
 * Responsibilities :
 * - Fetch and display all leads in kanban column layout
 * - Bucket leads into status-based columns (New → Won/Lost)
 * - Render lead cards with contact info and stale indicators
 * - Provide manual lead creation dialog with validation
 *
 * Features / Functionality :
 * - 5-column kanban: New, Contacted, Follow-up, Booked, Won/Lost
 * - LeadCard with phone link, service, campaign label, days-since
 * - Stale lead indicator (red dot for 48h+ no contact)
 * - Manual lead creation modal with name/phone/service
 * - Horizontal scroll on mobile, full width on desktop
 *
 * Tech Stack   : React, TypeScript, Tailwind CSS, Next.js
 * Layer        : Frontend
 *
 * Dependencies : @/lib/admin/leads, next/link
 *
 * Notes        : None
 ************************************************************/

'use client'

import {
  LEAD_COLUMNS,
  type LeadPipelineRow,
  type LeadStatus,
  formatDaysSince,
  leadCampaignLabel,
} from '@/lib/admin/leads'
import { Icon } from '@/components/ui/icon'
import { Phone } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'

type ServiceOption = {
  id: string
  name: string
  serviceType: 'salon' | 'spa'
}

const SERVICE_GROUP_LABELS: Record<ServiceOption['serviceType'], string> = {
  salon: 'Salon Services',
  spa: 'SPA Services',
}

export function LeadKanban() {
  const [leads, setLeads] = useState<LeadPipelineRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/leads')
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? 'Could not load leads.')
      }
      setLeads(json.data.leads as LeadPipelineRow[])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not load leads.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Bucket the flat rows into the five visible columns.
  const columns = useMemo(() => {
    const rows = leads ?? []
    return LEAD_COLUMNS.map((col) => {
      const statuses = new Set<LeadStatus>(col.statuses)
      return {
        ...col,
        items: rows.filter((lead) => statuses.has(lead.status)),
      }
    })
  }, [leads])

  const totalCount = leads?.length ?? 0

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-display text-cocoa-dark tracking-tight">Lead Pipeline</h1>
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[8px] bg-royal-gold text-cocoa-dark text-sm font-ui font-semibold motion-safe:transition-colors hover:bg-deep-gold"
        >
          + Manual Lead
        </button>
      </div>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : totalCount === 0 ? (
        <EmptyState />
      ) : (
        <>
          {/* Horizontal scroll on small screens; columns are regions. */}
          <div className="overflow-x-auto pb-2">
            <div className="flex gap-4 min-w-max lg:min-w-0">
              {columns.map((col) => (
                <KanbanColumn key={col.key} label={col.label} items={col.items} />
              ))}
            </div>
          </div>

          <p className="flex items-center gap-2 text-xs text-dusty-gray font-sans">
            <span className="inline-block h-2 w-2 rounded-full bg-error" aria-hidden="true" />
            Stale — no contact in 48h+. Cards show days since capture.
          </p>
        </>
      )}

      {dialogOpen && (
        <ManualLeadDialog
          onClose={() => setDialogOpen(false)}
          onCreated={() => {
            setDialogOpen(false)
            load()
          }}
        />
      )}
    </div>
  )
}

function KanbanColumn({
  label,
  items,
}: {
  label: string
  items: LeadPipelineRow[]
}) {
  return (
    <section
      aria-label={`${label} leads`}
      className="flex flex-col w-[260px] shrink-0 rounded-[6px] border border-cloud-gray bg-cloud-gray/30"
    >
      <header className="flex items-center justify-between px-3 py-2.5 border-b border-cloud-gray">
        <h2 className="text-xs font-ui uppercase tracking-wider text-dusty-gray">{label}</h2>
        <span className="text-xs font-ui font-medium text-warm-gray tabular-nums">
          {items.length}
        </span>
      </header>

      <div className="flex flex-col gap-2.5 p-2.5 min-h-[80px]">
        {items.length === 0 ? (
          <p className="px-1 py-3 text-center text-xs font-sans text-dusty-gray">No leads</p>
        ) : (
          items.map((lead) => <LeadCard key={lead.id} lead={lead} />)
        )}
      </div>
    </section>
  )
}

function LeadCard({ lead }: { lead: LeadPipelineRow }) {
  const phoneDigits = lead.phone.replace(/\s/g, '')
  return (
    <article className="rounded-[6px] border border-cloud-gray bg-canvas-white p-3 shadow-sm motion-safe:transition-shadow hover:shadow-card-hover">
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/leads/${lead.id}`}
          className="font-ui text-sm font-medium text-cocoa-dark hover:text-deep-gold motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-deep-gold rounded-[4px]"
        >
          {lead.name}
        </Link>
        {lead.isStale && (
          <span
            className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full bg-error"
            role="img"
            aria-label="Stale lead — no contact in 48 hours or more"
          />
        )}
      </div>

      <a
        href={`tel:${phoneDigits}`}
        className="mt-1.5 inline-flex items-center gap-1 font-sans text-xs text-warm-gray hover:text-deep-gold motion-safe:transition-colors"
        aria-label={`Call ${lead.name} at ${lead.phone}`}
      >
        <Icon icon={Phone} decorative size={14} />
        {lead.phone}
      </a>

      {lead.serviceName && (
        <p className="mt-1.5 font-sans text-xs text-cocoa-dark">{lead.serviceName}</p>
      )}

      <p className="mt-0.5 font-sans text-[11px] text-dusty-gray truncate">
        {leadCampaignLabel(lead)}
      </p>

      <p className="mt-2 font-sans text-[11px] text-dusty-gray">
        {formatDaysSince(lead.daysSinceCapture)}
      </p>
    </article>
  )
}

function ManualLeadDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [serviceInterestedId, setServiceInterestedId] = useState('')
  const [services, setServices] = useState<ServiceOption[] | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [fieldError, setFieldError] = useState<{ name?: string; phone?: string }>({})
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Escape to close.
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  // Body scroll lock + initial focus.
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const firstField = dialogRef.current?.querySelector<HTMLElement>('input, select')
    firstField?.focus()
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  // Fetch service options (best-effort; the field stays optional if it fails).
  useEffect(() => {
    let cancelled = false
    fetch('/api/services')
      .then((res) => res.json())
      .then((json) => {
        if (cancelled || !json?.success) {
          return
        }
        const categories = json.data.categories as {
          serviceType: 'salon' | 'spa'
          services: { id: string; name: string }[]
        }[]
        const options: ServiceOption[] = categories.flatMap((cat) =>
          cat.services.map((svc) => ({
            id: svc.id,
            name: svc.name,
            serviceType: cat.serviceType,
          })),
        )
        setServices(options)
      })
      .catch(() => {
        setServices([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const groupedServices = useMemo(() => {
    const list = services ?? []
    return (['salon', 'spa'] as const)
      .map((type) => ({
        type,
        options: list.filter((s) => s.serviceType === type),
      }))
      .filter((group) => group.options.length > 0)
  }, [services])

  const validate = useCallback((): boolean => {
    const next: { name?: string; phone?: string } = {}
    if (!name.trim()) {
      next.name = 'Name is required'
    }
    if (!/^[6-9]\d{9}$/.test(phone.trim())) {
      next.phone = 'Enter a valid 10-digit mobile number'
    }
    setFieldError(next)
    return Object.keys(next).length === 0
  }, [name, phone])

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setSubmitError(null)
      if (!validate()) {
        return
      }
      setSubmitting(true)
      try {
        const res = await fetch('/api/leads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(),
            phone: phone.trim(),
            serviceInterestedId: serviceInterestedId || undefined,
            source: 'manual',
          }),
        })
        const json = await res.json()
        if (!res.ok || !json.success) {
          throw new Error(json?.error?.message ?? 'Could not create the lead.')
        }
        onCreated()
      } catch (err: unknown) {
        setSubmitError(err instanceof Error ? err.message : 'Could not create the lead.')
      } finally {
        setSubmitting(false)
      }
    },
    [name, phone, serviceInterestedId, onCreated, validate],
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      // biome-ignore lint/a11y/useSemanticElements: custom modal with focus trap, aria-modal and Escape handling; native <dialog> would require showModal()/close() and break the backdrop + animation.
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close dialog"
        className="absolute inset-0 bg-cocoa-dark/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div
        ref={dialogRef}
        className="relative z-10 w-full max-w-md rounded-[6px] bg-canvas-white shadow-elevated"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-cloud-gray">
          <h2 id={titleId} className="font-display text-lg text-cocoa-dark tracking-tight">
            New Manual Lead
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-cloud-gray motion-safe:transition-colors"
            aria-label="Close dialog"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4 p-5" noValidate>
          {/* Name */}
          <div className="space-y-1.5">
            <label
              htmlFor="manual-lead-name"
              className="block font-ui text-sm font-medium text-warm-gray"
            >
              Name
            </label>
            <input
              id="manual-lead-name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={submitting}
              aria-required="true"
              aria-invalid={Boolean(fieldError.name)}
              aria-describedby={fieldError.name ? 'manual-lead-name-error' : undefined}
              className="min-h-[44px] w-full rounded-[8px] border border-outline-gray px-3 py-2.5 font-sans text-base text-cocoa-dark placeholder:text-dusty-gray focus:border-deep-gold focus:outline-none focus:ring-1 focus:ring-deep-gold disabled:opacity-60 aria-[invalid=true]:border-error"
            />
            {fieldError.name && (
              <p id="manual-lead-name-error" className="font-sans text-xs text-error" role="alert">
                {fieldError.name}
              </p>
            )}
          </div>

          {/* Phone with +91 prefix */}
          <div className="space-y-1.5">
            <label
              htmlFor="manual-lead-phone"
              className="block font-ui text-sm font-medium text-warm-gray"
            >
              Phone
            </label>
            <div className="flex items-stretch">
              <span
                className="inline-flex min-h-[44px] items-center rounded-l-[8px] border border-r-0 border-outline-gray bg-cloud-gray px-3 font-sans text-base text-warm-gray"
                aria-hidden="true"
              >
                +91
              </span>
              <input
                id="manual-lead-phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                disabled={submitting}
                placeholder="9876543210"
                aria-required="true"
                aria-invalid={Boolean(fieldError.phone)}
                aria-describedby={fieldError.phone ? 'manual-lead-phone-error' : undefined}
                className="min-h-[44px] w-full rounded-r-[8px] border border-outline-gray px-3 py-2.5 font-sans text-base text-cocoa-dark placeholder:text-dusty-gray focus:border-deep-gold focus:outline-none focus:ring-1 focus:ring-deep-gold disabled:opacity-60 aria-[invalid=true]:border-error"
              />
            </div>
            {fieldError.phone && (
              <p id="manual-lead-phone-error" className="font-sans text-xs text-error" role="alert">
                {fieldError.phone}
              </p>
            )}
          </div>

          {/* Service interest (optional) */}
          <div className="space-y-1.5">
            <label
              htmlFor="manual-lead-service"
              className="block font-ui text-sm font-medium text-warm-gray"
            >
              Service interest <span className="text-dusty-gray">(optional)</span>
            </label>
            <select
              id="manual-lead-service"
              value={serviceInterestedId}
              onChange={(e) => setServiceInterestedId(e.target.value)}
              disabled={submitting}
              className="min-h-[44px] w-full rounded-[8px] border border-outline-gray bg-canvas-white px-3 py-2.5 font-sans text-base text-cocoa-dark focus:border-deep-gold focus:outline-none focus:ring-1 focus:ring-deep-gold disabled:opacity-60"
            >
              <option value="">
                {services === null ? 'Loading services…' : 'Select service…'}
              </option>
              {groupedServices.map((group) => (
                <optgroup key={group.type} label={SERVICE_GROUP_LABELS[group.type]}>
                  {group.options.map((svc) => (
                    <option key={svc.id} value={svc.id}>
                      {svc.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {submitError && (
            <p className="font-sans text-sm text-error" role="alert">
              {submitError}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2.5 rounded-[8px] border border-cloud-gray text-cocoa-dark text-sm font-ui hover:bg-cloud-gray motion-safe:transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              aria-busy={submitting}
              className="px-4 py-2.5 rounded-[8px] bg-royal-gold text-cocoa-dark text-sm font-ui font-semibold hover:bg-deep-gold motion-safe:transition-colors disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Creating…' : 'Create Lead'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function LoadingState() {
  return (
    <output
      className="flex items-center gap-3 border border-cloud-gray rounded-[6px] bg-canvas-white px-5 py-16 justify-center"
      aria-live="polite"
    >
      <Spinner />
      <span className="font-sans text-sm text-dusty-gray">Loading leads…</span>
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
        className="px-4 py-2 rounded-[6px] bg-cocoa-dark text-canvas-white text-sm font-ui hover:bg-warm-gray motion-safe:transition-colors"
      >
        Try Again
      </button>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="border border-cloud-gray rounded-[6px] bg-canvas-white px-5 py-16 text-center">
      <p className="font-sans text-sm text-cocoa-dark mb-1">No leads yet</p>
      <p className="font-sans text-xs text-dusty-gray">
        New leads from the /book page and manual entries will appear here.
      </p>
    </div>
  )
}

function Spinner() {
  return (
    <svg
      className="h-5 w-5 motion-safe:animate-spin text-deep-gold"
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
