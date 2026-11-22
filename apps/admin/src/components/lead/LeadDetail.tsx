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

import { formatDateIN } from '@rgss/business'
import { ArrowLeft, ArrowRightLeft, MessageCircle, Phone, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { EmptyState } from '@/components/ui/state/empty-state'
import { ErrorState } from '@/components/ui/state/error-state'
import { Skeleton } from '@/components/ui/state/skeleton'
import { StatusBadge } from '@/components/ui/status-badge'
import { Textarea } from '@/components/ui/textarea'
import {
  ALLOWED_LEAD_TRANSITIONS,
  formatDaysSince,
  formatLeadDateTime,
  LEAD_TRANSITION_LABEL,
  type LeadNoteRow,
  type LeadStatus,
} from '@/lib/admin/leads'
import { toast } from '@/lib/admin/toast'

// The lead record returned by GET /api/leads/[id] (the lead row joined
// with its service-interest name, assigned-to name, and converted booking
// number). Timestamps arrive as ISO strings over the wire.
type LeadRecord = {
  id: string
  /** The pipeline (branch) the lead is in; writes send it back. */
  branchId: string
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

type Destination = { id: string; name: string }

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

export function LeadDetail({
  leadId,
  embedded = false,
  onMoved,
}: {
  leadId: string
  embedded?: boolean
  onMoved?: () => void
}) {
  const router = useRouter()
  const [lead, setLead] = useState<LeadRecord | null>(null)
  const [notes, setNotes] = useState<LeadNoteRow[]>([])
  const [destinations, setDestinations] = useState<Destination[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/leads/${leadId}`)
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? 'Could not load this lead.')
      }
      setLead(json.data.lead as LeadRecord)
      setNotes(json.data.notes as LeadNoteRow[])
      setDestinations(json.data.destinations ?? [])
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
      {embedded ? null : (
        <Link
          href="/leads"
          className="inline-flex items-center gap-1 font-ui text-sm text-warm-gray hover:text-deep-gold motion-safe:transition-colors"
        >
          <Icon icon={ArrowLeft} decorative size={16} /> Back to Pipeline
        </Link>
      )}

      {loading ? (
        <Skeleton rows={4} variant="card" />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : lead ? (
        <>
          <InfoCard
            lead={lead}
            destinations={destinations}
            onChanged={load}
            onMoved={() => {
              setLead(null)
              setNotes([])
              setLoading(true)
              if (onMoved) {
                onMoved()
              } else {
                router.replace('/leads')
              }
            }}
          />
          <AttributionPanel lead={lead} />
          <NotesTimeline leadId={leadId} branchId={lead.branchId} notes={notes} onAdded={load} />
        </>
      ) : (
        <EmptyState
          title="Lead not found"
          message="It may have been removed. Head back to the pipeline."
        />
      )}
    </div>
  )
}

function InfoCard({
  lead,
  destinations,
  onChanged,
  onMoved,
}: {
  lead: LeadRecord
  destinations: Destination[]
  onChanged: () => void
  onMoved: () => void
}) {
  const [busyStatus, setBusyStatus] = useState<LeadStatus | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [lostOpen, setLostOpen] = useState(false)
  const [lostReason, setLostReason] = useState('')
  const [moveOpen, setMoveOpen] = useState(false)
  const [toBranchId, setToBranchId] = useState('')
  const [moving, setMoving] = useState(false)
  const reasonId = useId()
  const destinationId = useId()
  const busy = busyStatus !== null || moving

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
        const res = await fetch(`/api/leads/${lead.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            reason
              ? { branchId: lead.branchId, status, reason }
              : { branchId: lead.branchId, status },
          ),
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
    [lead.id, lead.branchId, onChanged],
  )

  function submitLost(e: React.FormEvent) {
    e.preventDefault()
    if (!lostReason.trim()) {
      setActionError('A reason is required to mark a lead as lost.')
      return
    }
    patchStatus('lost', lostReason.trim())
  }

  async function submitMove(e: React.FormEvent) {
    e.preventDefault()
    if (busy || !toBranchId) return
    setMoving(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/leads/${lead.id}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branchId: lead.branchId, toBranchId }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? 'Could not move the lead.')
      }
      toast.success(`Lead moved to ${json.data.destination.name}`)
      onMoved()
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Could not move the lead.')
    } finally {
      setMoving(false)
    }
  }

  return (
    <section className="rounded-cards border border-cloud-gray bg-canvas-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-cocoa-dark tracking-tight">{lead.name}</h1>
          <a
            href={`tel:${lead.phone}`}
            className="mt-1.5 inline-flex items-center gap-1.5 font-sans text-sm text-warm-gray hover:text-deep-gold motion-safe:transition-colors"
            aria-label={`Call ${lead.name} at ${lead.phone}`}
          >
            <Icon icon={Phone} decorative size={15} />
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
          <StatusBadge status={lead.status} />
          <p className="font-sans text-xs text-dusty-gray">
            Created {formatDateIN(new Date(lead.createdAt))}
          </p>
          <p className="font-sans text-xs text-dusty-gray">{formatDaysSince(days)}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-cloud-gray pt-4">
        <Button asChild variant="outline" size="sm" className="font-ui">
          <a href={`tel:${lead.phone}`}>
            <Icon icon={Phone} decorative size={15} /> Call
          </a>
        </Button>
        <Button asChild variant="outline" size="sm" className="font-ui">
          <a href={whatsAppHref} target="_blank" rel="noopener noreferrer">
            <Icon icon={MessageCircle} decorative size={15} /> WhatsApp
          </a>
        </Button>

        {transitions.map((status) => (
          <Button
            key={status}
            type="button"
            size="sm"
            onClick={() => patchStatus(status)}
            disabled={busy || moveOpen}
            aria-busy={busyStatus === status}
            className="font-ui"
          >
            {busyStatus === status ? 'Saving…' : LEAD_TRANSITION_LABEL[status]}
          </Button>
        ))}

        {canMarkLost && !lostOpen && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setLostOpen(true)
              setActionError(null)
            }}
            disabled={busy || moveOpen}
            className="border-error/40 font-ui text-error hover:bg-error/5 hover:text-error"
          >
            <Icon icon={Trash2} decorative size={15} /> Mark Lost
          </Button>
        )}

        {destinations.length > 0 && !moveOpen && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || lostOpen}
            onClick={() => {
              setMoveOpen(true)
              setActionError(null)
            }}
            className="font-ui"
          >
            <Icon icon={ArrowRightLeft} decorative size={15} /> Move to another branch
          </Button>
        )}
      </div>

      {moveOpen && (
        <form onSubmit={submitMove} className="mt-3 space-y-2">
          <label
            htmlFor={destinationId}
            className="block font-ui text-sm font-medium text-warm-gray"
          >
            Destination branch
          </label>
          <Select value={toBranchId} onValueChange={setToBranchId} disabled={moving}>
            <SelectTrigger id={destinationId}>
              <SelectValue placeholder="Choose a branch" />
            </SelectTrigger>
            <SelectContent>
              {destinations.map(({ id, name }) => (
                <SelectItem key={id} value={id}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="font-sans text-sm text-warm-gray">
            The lead and its notes will move to the selected branch. The current assignment will be
            cleared.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={busy || !toBranchId} aria-busy={moving}>
              {moving ? 'Moving…' : 'Move lead'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={moving}
              onClick={() => {
                setMoveOpen(false)
                setToBranchId('')
                setActionError(null)
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {/* Inline "mark lost" reason form */}
      {lostOpen && (
        <form onSubmit={submitLost} className="mt-3 space-y-2">
          <label htmlFor={reasonId} className="block font-ui text-sm font-medium text-warm-gray">
            Reason for marking lost
          </label>
          <Textarea
            id={reasonId}
            value={lostReason}
            onChange={(e) => setLostReason(e.target.value)}
            rows={2}
            aria-required="true"
            placeholder="e.g. Unreachable after 5 attempts, chose another salon…"
          />
          <div className="flex items-center gap-2">
            <Button
              type="submit"
              variant="destructive"
              size="sm"
              disabled={busyStatus !== null}
              aria-busy={busyStatus === 'lost'}
              className="font-ui"
            >
              {busyStatus === 'lost' ? 'Saving…' : 'Confirm Lost'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setLostOpen(false)
                setLostReason('')
                setActionError(null)
              }}
              disabled={busyStatus !== null}
              className="font-ui"
            >
              Cancel
            </Button>
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
    <section className="rounded-cards border border-cloud-gray bg-canvas-white p-5">
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
  branchId,
  notes,
  onAdded,
}: {
  leadId: string
  branchId: string
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
        const res = await fetch(`/api/leads/${leadId}/notes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ branchId, content: content.trim() }),
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
    [branchId, content, leadId, onAdded],
  )

  return (
    <section className="rounded-cards border border-cloud-gray bg-canvas-white p-5">
      <h2 className="font-ui text-xs uppercase tracking-wider text-dusty-gray">Notes</h2>

      <form onSubmit={addNote} className="mt-3 space-y-2">
        <label htmlFor={fieldId} className="sr-only">
          Add a note
        </label>
        <Textarea
          id={fieldId}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={2}
          disabled={saving}
          placeholder="Add a note…"
        />
        <div className="flex items-center justify-end">
          <Button
            type="submit"
            size="sm"
            disabled={saving || !content.trim()}
            aria-busy={saving}
            className="font-ui"
          >
            {saving ? 'Saving…' : 'Save'}
          </Button>
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
              className="rounded-cards border border-cloud-gray bg-cloud-gray/20 p-3"
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
