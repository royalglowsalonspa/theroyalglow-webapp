/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : LeadDetail
 * Scope        : Lead Management UI
 *
 * Description  : Admin lead detail page with contact actions, status transitions,
 *                attribution panel, and notes timeline.
 *
 * Responsibilities :
 * - Fetch and display full lead detail from API
 * - Provide call/WhatsApp/status transition actions
 * - Show UTM attribution and conversion data
 * - Render notes timeline with add-note form
 * - Handle "Mark Lost" with required reason
 *
 * Features / Functionality :
 * - InfoCard with contact buttons and status badges
 * - Allowed status transitions from current state
 * - Mark Lost inline form with reason input
 * - Attribution panel (source, UTMs, assigned-to, converted booking)
 * - Notes timeline with add/save functionality
 *
 * Tech Stack   : React, TypeScript, Tailwind CSS, Next.js
 * Layer        : Frontend
 *
 * Dependencies : @/lib/admin/leads, @rgss/business, next/link
 *
 * Notes        : None
 ************************************************************/

'use client'

import {
  ALLOWED_LEAD_TRANSITIONS,
  LEAD_STATUS_META,
  LEAD_TRANSITION_LABEL,
  type LeadNoteRow,
  type LeadStatus,
  formatDaysSince,
  formatLeadDateTime,
} from '@/lib/admin/leads'
import { formatDateIN } from '@rgss/business'
import Link from 'next/link'
import { useCallback, useEffect, useId, useMemo, useState } from 'react'

// The lead record returned by GET /api/admin/leads/[id] (the lead row joined
// with its service-interest name, assigned-to name, and converted booking
// number). Timestamps arrive as ISO strings over the wire.
type LeadRecord = {
  id: string
  name: string
  phone: string
  email: string | null
  serviceInterestedId: string | null
  serviceName: string | null
  assignedToName: string | null
  status: LeadStatus
  source: string
  utmCampaign: string | null
  utmMedium: string | null
  utmSource: string | null
  utmContent: string | null
  utmTerm: string | null
  assignedTo: string | null
  convertedBookingId: string | null
  convertedBookingNumber: string | null
  lastContactedAt: string | null
  createdAt: string
  updatedAt: string
}

const MS_PER_DAY = 1000 * 60 * 60 * 24

// Days since the lead was captured, computed client-side from its createdAt.
function daysSinceCapture(iso: string): number {
  const created = new Date(iso).getTime()
  if (Number.isNaN(created)) {
    return 0
  }
  return Math.max(0, Math.floor((Date.now() - created) / MS_PER_DAY))
}

// Build a wa.me link: strip non-digits, drop a leading 91 if present, then
// prefix 91 so stored +91XXXXXXXXXX numbers resolve to wa.me/91XXXXXXXXXX.
function toWhatsAppLink(phone: string): string {
  let digits = phone.replace(/\D/g, '')
  if (digits.length > 10 && digits.startsWith('91')) {
    digits = digits.slice(2)
  }
  return `https://wa.me/91${digits}`
}

export function LeadDetail({ leadId }: { leadId: string }) {
  const [lead, setLead] = useState<LeadRecord | null>(null)
  const [notes, setNotes] = useState<LeadNoteRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/leads/${leadId}`)
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? 'Could not load this lead.')
      }
      setLead(json.data.lead as LeadRecord)
      setNotes(json.data.notes as LeadNoteRow[])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not load this lead.')
    } finally {
      setLoading(false)
    }
  }, [leadId])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="space-y-5">
      <Link
        href="/admin/leads"
        className="inline-flex items-center gap-1 font-ui text-sm text-warm-gray hover:text-deep-gold motion-safe:transition-colors"
      >
        <span aria-hidden="true">←</span> Back to Pipeline
      </Link>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : lead ? (
        <>
          <InfoCard lead={lead} onChanged={load} />
          <AttributionPanel lead={lead} />
          <NotesTimeline leadId={leadId} notes={notes} onAdded={load} />
        </>
      ) : (
        <EmptyState />
      )}
    </div>
  )
}

function InfoCard({
  lead,
  onChanged,
}: {
  lead: LeadRecord
  onChanged: () => void
}) {
  const [busyStatus, setBusyStatus] = useState<LeadStatus | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [lostOpen, setLostOpen] = useState(false)
  const [lostReason, setLostReason] = useState('')
  const reasonId = useId()

  const meta = LEAD_STATUS_META[lead.status]
  const days = daysSinceCapture(lead.createdAt)
  const whatsAppHref = toWhatsAppLink(lead.phone)

  // Allowed next moves for this lead, minus 'lost' (handled by its own flow).
  const transitions = useMemo(
    () => ALLOWED_LEAD_TRANSITIONS[lead.status].filter((s) => s !== 'lost'),
    [lead.status],
  )
  const canMarkLost = ALLOWED_LEAD_TRANSITIONS[lead.status].includes('lost')

  const patchStatus = useCallback(
    async (status: LeadStatus, reason?: string) => {
      setBusyStatus(status)
      setActionError(null)
      try {
        const res = await fetch(`/api/admin/leads/${lead.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(reason ? { status, reason } : { status }),
        })
        const json = await res.json()
        if (!res.ok || !json.success) {
          throw new Error(json?.error?.message ?? 'Could not update the lead.')
        }
        setLostOpen(false)
        setLostReason('')
        onChanged()
      } catch (err: unknown) {
        setActionError(err instanceof Error ? err.message : 'Could not update the lead.')
      } finally {
        setBusyStatus(null)
      }
    },
    [lead.id, onChanged],
  )

  function submitLost(e: React.FormEvent) {
    e.preventDefault()
    if (!lostReason.trim()) {
      setActionError('A reason is required to mark a lead as lost.')
      return
    }
    patchStatus('lost', lostReason.trim())
  }

  return (
    <section className="rounded-[6px] border border-cloud-gray bg-canvas-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-cocoa-dark tracking-tight">{lead.name}</h1>
          <a
            href={`tel:${lead.phone}`}
            className="mt-1.5 inline-flex items-center gap-1.5 font-sans text-sm text-warm-gray hover:text-deep-gold motion-safe:transition-colors"
            aria-label={`Call ${lead.name} at ${lead.phone}`}
          >
            <span aria-hidden="true">📞</span>
            {lead.phone}
            <span className="text-xs text-dusty-gray">(tap to call)</span>
          </a>
          {lead.serviceName && (
            <p className="mt-1.5 font-sans text-sm text-cocoa-dark">
              Interest: <span className="text-warm-gray">{lead.serviceName}</span>
            </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-1.5">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium font-ui ${meta.badge}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} aria-hidden="true" />
            {meta.label}
          </span>
          <p className="font-sans text-xs text-dusty-gray">
            Created {formatDateIN(new Date(lead.createdAt))}
          </p>
          <p className="font-sans text-xs text-dusty-gray">{formatDaysSince(days)}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-cloud-gray pt-4">
        <a
          href={`tel:${lead.phone}`}
          className="inline-flex items-center gap-1.5 rounded-[8px] border border-outline-gray px-3.5 py-2 font-ui text-sm text-cocoa-dark hover:bg-cloud-gray motion-safe:transition-colors"
        >
          <span aria-hidden="true">📞</span> Call
        </a>
        <a
          href={whatsAppHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-[8px] border border-outline-gray px-3.5 py-2 font-ui text-sm text-cocoa-dark hover:bg-cloud-gray motion-safe:transition-colors"
        >
          <span aria-hidden="true">💬</span> WhatsApp
        </a>

        {transitions.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => patchStatus(status)}
            disabled={busyStatus !== null}
            aria-busy={busyStatus === status}
            className="inline-flex items-center gap-1.5 rounded-[8px] bg-royal-gold px-3.5 py-2 font-ui text-sm font-semibold text-cocoa-dark hover:bg-deep-gold motion-safe:transition-colors disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busyStatus === status ? 'Saving…' : LEAD_TRANSITION_LABEL[status]}
          </button>
        ))}

        {canMarkLost && !lostOpen && (
          <button
            type="button"
            onClick={() => {
              setLostOpen(true)
              setActionError(null)
            }}
            disabled={busyStatus !== null}
            className="inline-flex items-center gap-1.5 rounded-[8px] border border-error/40 px-3.5 py-2 font-ui text-sm text-error hover:bg-error/5 motion-safe:transition-colors disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span aria-hidden="true">🗑</span> Mark Lost
          </button>
        )}
      </div>

      {/* Inline "mark lost" reason form */}
      {lostOpen && (
        <form onSubmit={submitLost} className="mt-3 space-y-2">
          <label htmlFor={reasonId} className="block font-ui text-sm font-medium text-warm-gray">
            Reason for marking lost
          </label>
          <textarea
            id={reasonId}
            value={lostReason}
            onChange={(e) => setLostReason(e.target.value)}
            rows={2}
            aria-required="true"
            placeholder="e.g. Unreachable after 5 attempts, chose another salon…"
            className="w-full rounded-[8px] border border-outline-gray px-3 py-2 font-sans text-sm text-cocoa-dark placeholder:text-dusty-gray focus:border-deep-gold focus:outline-none focus:ring-1 focus:ring-deep-gold"
          />
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={busyStatus !== null}
              aria-busy={busyStatus === 'lost'}
              className="inline-flex items-center gap-1.5 rounded-[8px] bg-error px-3.5 py-2 font-ui text-sm font-semibold text-canvas-white hover:bg-error/90 motion-safe:transition-colors disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busyStatus === 'lost' ? 'Saving…' : 'Confirm Lost'}
            </button>
            <button
              type="button"
              onClick={() => {
                setLostOpen(false)
                setLostReason('')
                setActionError(null)
              }}
              disabled={busyStatus !== null}
              className="rounded-[8px] border border-cloud-gray px-3.5 py-2 font-ui text-sm text-cocoa-dark hover:bg-cloud-gray motion-safe:transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {actionError && (
        <p className="mt-3 font-sans text-sm text-error" role="alert">
          {actionError}
        </p>
      )}
    </section>
  )
}

function AttributionPanel({ lead }: { lead: LeadRecord }) {
  const rows: { label: string; value: string | null }[] = [
    { label: 'Source', value: lead.source },
    { label: 'UTM Source', value: lead.utmSource },
    { label: 'UTM Medium', value: lead.utmMedium },
    { label: 'UTM Campaign', value: lead.utmCampaign },
    { label: 'UTM Content', value: lead.utmContent },
    { label: 'Converted Booking', value: lead.convertedBookingNumber },
    { label: 'Assigned To', value: lead.assignedToName },
  ]

  return (
    <section className="rounded-[6px] border border-cloud-gray bg-canvas-white p-5">
      <h2 className="font-ui text-xs uppercase tracking-wider text-dusty-gray">Attribution</h2>
      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-3">
            <dt className="font-sans text-sm text-dusty-gray">{row.label}</dt>
            <dd className="font-sans text-sm text-cocoa-dark text-right">{row.value ?? '—'}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function NotesTimeline({
  leadId,
  notes,
  onAdded,
}: {
  leadId: string
  notes: LeadNoteRow[]
  onAdded: () => void
}) {
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [noteError, setNoteError] = useState<string | null>(null)
  const fieldId = useId()

  const addNote = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!content.trim()) {
        return
      }
      setSaving(true)
      setNoteError(null)
      try {
        const res = await fetch(`/api/admin/leads/${leadId}/notes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: content.trim() }),
        })
        const json = await res.json()
        if (!res.ok || !json.success) {
          throw new Error(json?.error?.message ?? 'Could not add the note.')
        }
        setContent('')
        onAdded()
      } catch (err: unknown) {
        setNoteError(err instanceof Error ? err.message : 'Could not add the note.')
      } finally {
        setSaving(false)
      }
    },
    [content, leadId, onAdded],
  )

  return (
    <section className="rounded-[6px] border border-cloud-gray bg-canvas-white p-5">
      <h2 className="font-ui text-xs uppercase tracking-wider text-dusty-gray">Notes</h2>

      <form onSubmit={addNote} className="mt-3 space-y-2">
        <label htmlFor={fieldId} className="sr-only">
          Add a note
        </label>
        <textarea
          id={fieldId}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={2}
          disabled={saving}
          placeholder="Add a note…"
          className="w-full rounded-[8px] border border-outline-gray px-3 py-2 font-sans text-sm text-cocoa-dark placeholder:text-dusty-gray focus:border-deep-gold focus:outline-none focus:ring-1 focus:ring-deep-gold disabled:opacity-60"
        />
        <div className="flex items-center justify-end">
          <button
            type="submit"
            disabled={saving || !content.trim()}
            aria-busy={saving}
            className="rounded-[8px] bg-royal-gold px-4 py-2 font-ui text-sm font-semibold text-cocoa-dark hover:bg-deep-gold motion-safe:transition-colors disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>

      {noteError && (
        <p className="mt-2 font-sans text-sm text-error" role="alert">
          {noteError}
        </p>
      )}

      <ol className="mt-4 space-y-3">
        {notes.length === 0 ? (
          <li className="font-sans text-sm text-dusty-gray">No notes yet.</li>
        ) : (
          notes.map((note) => (
            <li
              key={note.id}
              className="rounded-[6px] border border-cloud-gray bg-cloud-gray/20 p-3"
            >
              <p className="font-sans text-[11px] text-dusty-gray">
                {formatLeadDateTime(note.createdAt)}
                {note.authorName ? ` · ${note.authorName}` : ''}
              </p>
              <p className="mt-1 font-sans text-sm text-cocoa-dark whitespace-pre-wrap">
                {note.content}
              </p>
            </li>
          ))
        )}
      </ol>
    </section>
  )
}

function LoadingState() {
  return (
    <output
      className="flex items-center gap-3 border border-cloud-gray rounded-[6px] bg-canvas-white px-5 py-16 justify-center"
      aria-live="polite"
    >
      <Spinner />
      <span className="font-sans text-sm text-dusty-gray">Loading lead…</span>
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
      <p className="font-sans text-sm text-cocoa-dark mb-1">Lead not found</p>
      <p className="font-sans text-xs text-dusty-gray">
        It may have been removed. Head back to the pipeline.
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
