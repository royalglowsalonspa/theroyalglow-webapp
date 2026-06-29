/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp
 * Module Name  : LeadKanban
 * Scope        : Lead Management UI
 *
 * Description  : Admin lead pipeline kanban board with 5 columns, lead cards,
 *                stale indicators, and a manual lead-creation dialog. Migrated
 *                onto the admin design-system primitives: shared state
 *                presenters (Skeleton / EmptyState / ErrorState), shadcn
 *                `Button`, shadcn `Dialog` (Radix — focus trap / Esc / backdrop
 *                / scroll lock), and brand radius tokens. All lead/form logic
 *                (fetch, bucketing, validation, submit) is preserved.
 *
 * Responsibilities :
 * - Fetch and display all leads in kanban column layout
 * - Bucket leads into status-based columns (New → Won/Lost)
 * - Render lead cards with contact info and stale indicators
 * - Provide manual lead creation dialog with validation
 *
 * Tech Stack   : React (Client Component), TypeScript, shadcn (Button, Dialog),
 *                Tailwind CSS v4 (Brand Tokens), Next.js
 * Layer        : Presentation
 *
 * Dependencies : @/components/ui/{button,dialog,icon,state/*}, @/lib/admin/leads,
 *                next/link
 *
 * Notes        : Horizontal scroll on mobile, full width on desktop. The
 *                creation dialog composes shadcn Dialog, so the previous manual
 *                Escape / scroll-lock / focus-trap effects are removed (Radix
 *                provides them).
 ************************************************************/

'use client'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Icon } from '@/components/ui/icon'
import { EmptyState } from '@/components/ui/state/empty-state'
import { ErrorState } from '@/components/ui/state/error-state'
import { Skeleton } from '@/components/ui/state/skeleton'
import {
  LEAD_COLUMNS,
  type LeadPipelineRow,
  type LeadStatus,
  formatDaysSince,
  leadCampaignLabel,
} from '@/lib/admin/leads'
import { Inbox, Phone } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'

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
        <h1 className="font-display text-2xl tracking-tight text-cocoa-dark">Lead Pipeline</h1>
        <Button type="button" onClick={() => setDialogOpen(true)} className="font-ui">
          + Manual Lead
        </Button>
      </div>

      {loading ? (
        <Skeleton variant="card" rows={4} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : totalCount === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No leads yet"
          message="New leads from the /book page and manual entries will appear here."
        />
      ) : (
        <>
          {/* Horizontal scroll on small screens; columns are regions. */}
          <div className="overflow-x-auto pb-2">
            <div className="flex min-w-max gap-4 lg:min-w-0">
              {columns.map((col) => (
                <KanbanColumn key={col.key} label={col.label} items={col.items} />
              ))}
            </div>
          </div>

          <p className="flex items-center gap-2 font-sans text-xs text-dusty-gray">
            <span className="inline-block h-2 w-2 rounded-pill bg-error" aria-hidden="true" />
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
      className="flex w-[260px] shrink-0 flex-col rounded-cards border border-cloud-gray bg-cloud-gray/30"
    >
      <header className="flex items-center justify-between border-b border-cloud-gray px-3 py-2.5">
        <h2 className="font-ui text-xs uppercase tracking-wider text-dusty-gray">{label}</h2>
        <span className="font-ui text-xs font-medium tabular-nums text-warm-gray">
          {items.length}
        </span>
      </header>

      <div className="flex min-h-[80px] flex-col gap-2.5 p-2.5">
        {items.length === 0 ? (
          <p className="px-1 py-3 text-center font-sans text-xs text-dusty-gray">No leads</p>
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
    <article className="rounded-cards border border-cloud-gray bg-canvas-white p-3 shadow-sm motion-safe:transition-shadow hover:shadow-card-hover">
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/leads/${lead.id}`}
          className="rounded-cards font-ui text-sm font-medium text-cocoa-dark hover:text-deep-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-deep-gold motion-safe:transition-colors"
        >
          {lead.name}
        </Link>
        {lead.isStale && (
          <span
            className="mt-1 inline-block h-2 w-2 shrink-0 rounded-pill bg-error"
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

      <p className="mt-0.5 truncate font-sans text-[11px] text-dusty-gray">
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
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [serviceInterestedId, setServiceInterestedId] = useState('')
  const [services, setServices] = useState<ServiceOption[] | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [fieldError, setFieldError] = useState<{ name?: string; phone?: string }>({})
  const [submitError, setSubmitError] = useState<string | null>(null)

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
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose()
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-lg tracking-tight text-cocoa-dark">
            New Manual Lead
          </DialogTitle>
          <DialogDescription className="sr-only">
            Create a lead by entering a name and phone number.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4" noValidate>
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
              className="min-h-11 w-full rounded-buttons border border-outline-gray px-3 py-2.5 font-sans text-base text-cocoa-dark placeholder:text-dusty-gray focus:border-deep-gold focus:outline-none focus:ring-1 focus:ring-deep-gold disabled:opacity-60 aria-[invalid=true]:border-error"
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
                className="inline-flex min-h-11 items-center rounded-l-buttons border border-r-0 border-outline-gray bg-cloud-gray px-3 font-sans text-base text-warm-gray"
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
                className="min-h-11 w-full rounded-r-buttons border border-outline-gray px-3 py-2.5 font-sans text-base text-cocoa-dark placeholder:text-dusty-gray focus:border-deep-gold focus:outline-none focus:ring-1 focus:ring-deep-gold disabled:opacity-60 aria-[invalid=true]:border-error"
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
              className="min-h-11 w-full rounded-buttons border border-outline-gray bg-canvas-white px-3 py-2.5 font-sans text-base text-cocoa-dark focus:border-deep-gold focus:outline-none focus:ring-1 focus:ring-deep-gold disabled:opacity-60"
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

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={submitting}
              className="font-ui"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} aria-busy={submitting} className="font-ui">
              {submitting ? 'Creating…' : 'Create Lead'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
