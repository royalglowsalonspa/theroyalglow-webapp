'use client'

import { StatusBadge } from '@/components/admin/StatusBadge'
import { formatDateDDMMYYYY, formatINR } from '@/lib/admin/bookings'
import Link from 'next/link'
import { useCallback, useMemo, useState } from 'react'

export interface ProfileTag {
  slug: string
  name: string
  color: string | null
}

export interface TagOption {
  id: string
  slug: string
  name: string
  color: string | null
}

export interface BookingRow {
  id: string
  bookingNumber: string
  serviceType: string
  status: string
  bookingDate: string | null
  totalAmountPaise: number
  isMembershipSession: boolean
}

export interface InvoiceRow {
  id: string
  invoiceNumber: string
  invoiceType: string
  paymentStatus: string
  totalAmountPaise: number
  gemsEarned: number
  createdAt: string | null
}

export interface MembershipRow {
  id: string
  membershipNumber: string
  tierNameSnapshot: string
  status: string
  totalHoursMinutes: number
  usedHoursMinutes: number
  startsAt: string | null
  expiresAt: string | null
}

export interface MembershipData {
  active: MembershipRow | null
  past: MembershipRow[]
}

export interface NoteRow {
  id: string
  content: string
  authorName: string
  createdAt: string | null
}

const TABS = [
  { id: 'bookings', label: 'Bookings' },
  { id: 'invoices', label: 'Invoices' },
  { id: 'membership', label: 'Membership' },
  { id: 'gems', label: 'Gems' },
  { id: 'notes', label: 'Notes' },
] as const

type TabId = (typeof TABS)[number]['id']

const INVOICE_TYPE_LABELS: Record<string, string> = {
  service: 'Service',
  membership_purchase: 'Membership',
  membership_session: 'Session',
}

// Minutes → "Xh Ym".
function formatHoursMinutes(totalMinutes: number): string {
  const safe = Math.max(0, Math.round(totalMinutes))
  return `${Math.floor(safe / 60)}h ${safe % 60}m`
}

export function CustomerProfileTabs({
  customerId,
  tags,
  allTags,
  gemsBalance,
  bookings,
  invoices,
  membership,
  notes,
}: {
  customerId: string
  tags: ProfileTag[]
  allTags: TagOption[]
  gemsBalance: number
  bookings: BookingRow[]
  invoices: InvoiceRow[]
  membership: MembershipData
  notes: NoteRow[]
}) {
  const [tab, setTab] = useState<TabId>('bookings')

  return (
    <div className="space-y-5">
      <TagSection customerId={customerId} initialTags={tags} allTags={allTags} />

      <div>
        <div
          role="tablist"
          aria-label="Customer details"
          className="flex flex-wrap gap-1 border-b border-cloud-gray"
        >
          {TABS.map((t) => {
            const active = tab === t.id
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={active}
                aria-controls={`panel-${t.id}`}
                onClick={() => setTab(t.id)}
                className={`px-4 py-2 text-sm font-ui transition-colors border-b-2 -mb-px focus:outline-none focus:ring-2 focus:ring-deep-gold rounded-t-[4px] ${
                  active
                    ? 'border-deep-gold text-cocoa-dark'
                    : 'border-transparent text-dusty-gray hover:text-cocoa-dark'
                }`}
              >
                {t.label}
              </button>
            )
          })}
        </div>

        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="pt-4">
          {tab === 'bookings' && <BookingsPanel bookings={bookings} />}
          {tab === 'invoices' && <InvoicesPanel invoices={invoices} />}
          {tab === 'membership' && <MembershipPanel membership={membership} />}
          {tab === 'gems' && <GemsPanel gemsBalance={gemsBalance} />}
          {tab === 'notes' && <NotesPanel customerId={customerId} initialNotes={notes} />}
        </div>
      </div>
    </div>
  )
}

// --- Tags: chips with remove + add (assign existing / create new) ---
function TagSection({
  customerId,
  initialTags,
  allTags,
}: {
  customerId: string
  initialTags: ProfileTag[]
  allTags: TagOption[]
}) {
  const [tags, setTags] = useState<ProfileTag[]>(initialTags)
  const [catalogue, setCatalogue] = useState<TagOption[]>(allTags)
  const [adding, setAdding] = useState(false)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [tagError, setTagError] = useState<string | null>(null)

  const slugToId = useMemo(() => {
    const map = new Map<string, string>()
    for (const t of catalogue) {
      map.set(t.slug, t.id)
    }
    return map
  }, [catalogue])

  const assignedSlugs = useMemo(() => new Set(tags.map((t) => t.slug)), [tags])

  const suggestions = useMemo(() => {
    const trimmed = query.trim().toLowerCase()
    return catalogue
      .filter((t) => !assignedSlugs.has(t.slug))
      .filter((t) => (trimmed ? t.name.toLowerCase().includes(trimmed) : true))
      .slice(0, 8)
  }, [catalogue, assignedSlugs, query])

  const exactMatch = useMemo(
    () => catalogue.find((t) => t.name.toLowerCase() === query.trim().toLowerCase()),
    [catalogue, query],
  )

  const remove = useCallback(
    async (slug: string) => {
      const tagId = slugToId.get(slug)
      if (!tagId) {
        setTagError('Could not resolve this tag. Refresh and try again.')
        return
      }
      setBusy(true)
      setTagError(null)
      try {
        const res = await fetch(`/api/admin/customers/${customerId}/tags/${tagId}`, {
          method: 'DELETE',
        })
        const json = await res.json()
        if (!res.ok || !json.success) {
          throw new Error(json?.error?.message ?? 'Could not remove this tag.')
        }
        setTags((prev) => prev.filter((t) => t.slug !== slug))
      } catch (err: unknown) {
        setTagError(err instanceof Error ? err.message : 'Could not remove this tag.')
      } finally {
        setBusy(false)
      }
    },
    [customerId, slugToId],
  )

  const assign = useCallback(
    async (option: TagOption) => {
      setBusy(true)
      setTagError(null)
      try {
        const res = await fetch(`/api/admin/customers/${customerId}/tags`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ tagId: option.id }),
        })
        const json = await res.json()
        if (!res.ok || !json.success) {
          throw new Error(json?.error?.message ?? 'Could not assign this tag.')
        }
        setTags((prev) =>
          prev.some((t) => t.slug === option.slug)
            ? prev
            : [...prev, { slug: option.slug, name: option.name, color: option.color }],
        )
        setQuery('')
        setAdding(false)
      } catch (err: unknown) {
        setTagError(err instanceof Error ? err.message : 'Could not assign this tag.')
      } finally {
        setBusy(false)
      }
    },
    [customerId],
  )

  const createAndAssign = useCallback(async () => {
    const name = query.trim()
    if (!name) {
      return
    }
    setBusy(true)
    setTagError(null)
    try {
      const res = await fetch('/api/admin/tags', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        if (res.status === 403) {
          throw new Error('Only a manager can create new tags.')
        }
        throw new Error(json?.error?.message ?? 'Could not create this tag.')
      }
      const created = json.data.tag as TagOption
      setCatalogue((prev) =>
        prev.some((t) => t.id === created.id) ? prev : [...prev, created],
      )
      await assign(created)
    } catch (err: unknown) {
      setTagError(err instanceof Error ? err.message : 'Could not create this tag.')
      setBusy(false)
    }
  }, [query, assign])

  return (
    <section className="border border-cloud-gray rounded-[6px] bg-canvas-white p-5 space-y-2">
      <span className="text-[10px] font-ui uppercase tracking-wider text-dusty-gray">Tags</span>
      <div className="flex flex-wrap items-center gap-2">
        {tags.length === 0 ? (
          <span className="text-sm text-dusty-gray font-sans">No tags yet.</span>
        ) : (
          tags.map((t) => (
            <span
              key={t.slug}
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-ui bg-golden-mist text-warm-gray"
              style={t.color ? { backgroundColor: `${t.color}1a`, color: t.color } : undefined}
            >
              {t.name}
              <button
                type="button"
                onClick={() => remove(t.slug)}
                disabled={busy}
                aria-label={`Remove tag ${t.name}`}
                className="ml-0.5 rounded-full hover:text-cocoa-dark focus:outline-none focus:ring-2 focus:ring-deep-gold disabled:opacity-50"
              >
                ✕
              </button>
            </span>
          ))
        )}

        {adding ? (
          <div className="relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search or create a tag…"
              // biome-ignore lint/a11y/noAutofocus: focus the field when the picker opens
              autoFocus
              aria-label="Add a tag"
              className="h-8 px-2.5 rounded-[6px] border border-outline-gray bg-canvas-white text-sm font-sans text-cocoa-dark focus:outline-none focus:ring-2 focus:ring-deep-gold"
            />
            <button
              type="button"
              onClick={() => {
                setAdding(false)
                setQuery('')
                setTagError(null)
              }}
              className="ml-1.5 text-xs font-ui text-dusty-gray hover:text-cocoa-dark"
            >
              Cancel
            </button>
            {(suggestions.length > 0 || (query.trim() && !exactMatch)) && (
              <ul className="absolute z-10 mt-1 w-56 max-h-56 overflow-y-auto rounded-[6px] border border-cloud-gray bg-canvas-white shadow-sm py-1">
                {suggestions.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => assign(s)}
                      disabled={busy}
                      className="w-full text-left px-3 py-1.5 text-sm font-sans text-cocoa-dark hover:bg-cloud-gray/60 disabled:opacity-50"
                    >
                      {s.name}
                    </button>
                  </li>
                ))}
                {query.trim() && !exactMatch && (
                  <li>
                    <button
                      type="button"
                      onClick={createAndAssign}
                      disabled={busy}
                      className="w-full text-left px-3 py-1.5 text-sm font-ui text-deep-gold hover:bg-cloud-gray/60 disabled:opacity-50"
                    >
                      + Create “{query.trim()}”
                    </button>
                  </li>
                )}
              </ul>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center rounded-full border border-dashed border-outline-gray px-2.5 py-0.5 text-xs font-ui text-warm-gray hover:text-cocoa-dark hover:border-deep-gold transition-colors focus:outline-none focus:ring-2 focus:ring-deep-gold"
          >
            + Add
          </button>
        )}
      </div>
      {tagError && (
        <p className="text-xs text-error font-sans" role="alert">
          {tagError}
        </p>
      )}
    </section>
  )
}

// --- Bookings tab ---
function BookingsPanel({ bookings }: { bookings: BookingRow[] }) {
  if (bookings.length === 0) {
    return <EmptyPanel message="No bookings yet." />
  }
  return (
    <div className="border border-cloud-gray rounded-[6px] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-cloud-gray/60">
              <Th>Booking #</Th>
              <Th>Date</Th>
              <Th>Type</Th>
              <Th>Status</Th>
              <Th>Amount</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cloud-gray">
            {bookings.map((b) => (
              <tr key={b.id} className="hover:bg-cloud-gray/30 transition-colors">
                <td className="px-4 py-3 font-mono text-xs text-cocoa-dark whitespace-nowrap">
                  <Link
                    href={`/admin/bookings/${b.id}`}
                    className="text-deep-gold hover:text-cocoa-dark transition-colors"
                  >
                    {b.bookingNumber}
                  </Link>
                </td>
                <td className="px-4 py-3 font-sans text-warm-gray whitespace-nowrap">
                  {b.bookingDate ? formatDateDDMMYYYY(b.bookingDate) : '—'}
                </td>
                <td className="px-4 py-3 font-sans text-warm-gray whitespace-nowrap">
                  {b.serviceType === 'spa' ? 'SPA' : 'Salon'}
                  {b.isMembershipSession ? ' · Session' : ''}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={b.status} />
                </td>
                <td className="px-4 py-3 font-ui text-cocoa-dark whitespace-nowrap">
                  {formatINR(b.totalAmountPaise)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// --- Invoices tab ---
function InvoicesPanel({ invoices }: { invoices: InvoiceRow[] }) {
  if (invoices.length === 0) {
    return <EmptyPanel message="No invoices yet." />
  }
  return (
    <div className="border border-cloud-gray rounded-[6px] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-cloud-gray/60">
              <Th>Invoice #</Th>
              <Th>Date</Th>
              <Th>Type</Th>
              <Th>Status</Th>
              <Th>Gems</Th>
              <Th>Total</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cloud-gray">
            {invoices.map((inv) => (
              <tr key={inv.id} className="hover:bg-cloud-gray/30 transition-colors">
                <td className="px-4 py-3 font-mono text-xs text-cocoa-dark whitespace-nowrap">
                  {inv.invoiceNumber}
                </td>
                <td className="px-4 py-3 font-sans text-warm-gray whitespace-nowrap">
                  {inv.createdAt ? formatDateDDMMYYYY(inv.createdAt) : '—'}
                </td>
                <td className="px-4 py-3 font-sans text-warm-gray whitespace-nowrap">
                  {INVOICE_TYPE_LABELS[inv.invoiceType] ?? inv.invoiceType}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={inv.paymentStatus} />
                </td>
                <td className="px-4 py-3 font-sans text-warm-gray whitespace-nowrap">
                  {inv.gemsEarned > 0 ? `+${inv.gemsEarned}` : '—'}
                </td>
                <td className="px-4 py-3 font-ui text-cocoa-dark whitespace-nowrap">
                  {formatINR(inv.totalAmountPaise)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// --- Membership tab ---
function MembershipPanel({ membership }: { membership: MembershipData }) {
  const { active, past } = membership
  if (!active && past.length === 0) {
    return <EmptyPanel message="No memberships on record." />
  }
  return (
    <div className="space-y-4">
      {active && <MembershipCard membership={active} highlight />}
      {past.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-ui uppercase tracking-wider text-dusty-gray">Past</p>
          {past.map((m) => (
            <MembershipCard key={m.id} membership={m} highlight={false} />
          ))}
        </div>
      )}
    </div>
  )
}

function MembershipCard({
  membership,
  highlight,
}: {
  membership: MembershipRow
  highlight: boolean
}) {
  const total = membership.totalHoursMinutes
  const used = Math.min(membership.usedHoursMinutes, total)
  const remaining = Math.max(0, total - used)
  const usedPct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0

  return (
    <div
      className={`border rounded-[6px] bg-canvas-white p-4 ${
        highlight ? 'border-deep-gold/50' : 'border-cloud-gray'
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="font-sans text-cocoa-dark">
            {membership.tierNameSnapshot}
            <span className="text-dusty-gray text-xs"> · #{membership.membershipNumber}</span>
          </p>
          <p className="text-xs font-sans text-dusty-gray">
            {membership.startsAt ? formatDateDDMMYYYY(membership.startsAt) : '—'}
            {' – '}
            {membership.expiresAt ? formatDateDDMMYYYY(membership.expiresAt) : '—'}
          </p>
        </div>
        <StatusBadge status={membership.status} />
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-cloud-gray" aria-hidden="true">
        <div className="h-full rounded-full bg-deep-gold" style={{ width: `${usedPct}%` }} />
      </div>
      <p className="mt-2 text-xs font-sans text-warm-gray">
        {formatHoursMinutes(used)} used · {formatHoursMinutes(remaining)} remaining of{' '}
        {formatHoursMinutes(total)}
      </p>
    </div>
  )
}

// --- Gems tab ---
function GemsPanel({ gemsBalance }: { gemsBalance: number }) {
  return (
    <div className="border border-cloud-gray rounded-[6px] bg-canvas-white p-5">
      <p className="text-[10px] font-ui uppercase tracking-wider text-dusty-gray mb-1">
        Gems Balance
      </p>
      <p className="text-2xl font-display text-cocoa-dark">{gemsBalance}</p>
      <p className="text-xs font-sans text-dusty-gray mt-2">
        Full earn/redeem history is available on the customer&apos;s own gems page.
      </p>
    </div>
  )
}

// --- Notes tab: list + add ---
function NotesPanel({
  customerId,
  initialNotes,
}: {
  customerId: string
  initialNotes: NoteRow[]
}) {
  const [notes, setNotes] = useState<NoteRow[]>(initialNotes)
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [noteError, setNoteError] = useState<string | null>(null)

  const addNote = useCallback(async () => {
    const trimmed = content.trim()
    if (!trimmed) {
      setNoteError('Write something before saving.')
      return
    }
    setSubmitting(true)
    setNoteError(null)
    try {
      const res = await fetch(`/api/admin/customers/${customerId}/notes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: trimmed }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? 'Could not save this note.')
      }
      const saved = json.data.note as { id: string; content: string; createdAt: string }
      setNotes((prev) => [
        {
          id: saved.id,
          content: saved.content,
          authorName: 'You',
          createdAt: saved.createdAt,
        },
        ...prev,
      ])
      setContent('')
    } catch (err: unknown) {
      setNoteError(err instanceof Error ? err.message : 'Could not save this note.')
    } finally {
      setSubmitting(false)
    }
  }, [content, customerId])

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="space-y-2">
        <label
          htmlFor="note-content"
          className="text-[10px] font-ui uppercase tracking-wider text-dusty-gray"
        >
          Add a note
        </label>
        <textarea
          id="note-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="Add a note about this customer…"
          className="w-full px-3 py-2 rounded-[6px] border border-outline-gray bg-canvas-white text-sm font-sans text-cocoa-dark focus:outline-none focus:ring-2 focus:ring-deep-gold resize-none"
        />
        {noteError && (
          <p className="text-xs text-error font-sans" role="alert">
            {noteError}
          </p>
        )}
        <button
          type="button"
          onClick={addNote}
          disabled={submitting}
          aria-busy={submitting}
          className="px-4 py-2 rounded-[6px] bg-cocoa-dark text-canvas-white text-sm font-ui hover:bg-warm-gray transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Saving…' : 'Save Note'}
        </button>
      </div>

      <div className="space-y-3">
        {notes.length === 0 ? (
          <p className="text-sm text-dusty-gray font-sans">No notes yet.</p>
        ) : (
          notes.map((n) => (
            <div key={n.id} className="border border-cloud-gray rounded-[6px] bg-canvas-white p-3">
              <p className="text-[11px] font-ui uppercase tracking-wider text-dusty-gray mb-1">
                {n.createdAt ? formatDateDDMMYYYY(n.createdAt) : '—'} · {n.authorName}
              </p>
              <p className="text-sm font-sans text-cocoa-dark whitespace-pre-wrap">{n.content}</p>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// --- Shared primitives ---
function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-left px-4 py-2.5 font-ui text-xs uppercase tracking-wider text-dusty-gray">
      {children}
    </th>
  )
}

function EmptyPanel({ message }: { message: string }) {
  return (
    <div className="border border-cloud-gray rounded-[6px] bg-canvas-white px-5 py-12 text-center">
      <p className="font-sans text-sm text-dusty-gray">{message}</p>
    </div>
  )
}
