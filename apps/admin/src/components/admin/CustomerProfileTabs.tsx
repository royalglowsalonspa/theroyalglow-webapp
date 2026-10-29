/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : CustomerProfileTabs
 * Scope        : Admin UI — CRM
 *
 * Description  : Tabbed customer profile view showing history, invoices,
 *                membership, gems, notes, and tag management, as the active
 *                branch sees a customer every Royal Glow branch shares.
 *
 * Responsibilities :
 * - Render tabbed interface for customer detail data
 * - Manage CRM tags (assign, create, remove) via API
 * - Display history/invoice/membership tables
 * - Support inline note creation with a shared or branch-only choice
 *
 * Features / Functionality :
 * - Accessible tab panel with aria-selected/aria-controls
 * - Tag chips with search/create/remove functionality
 * - Other branches' visits show date, branch and services only (R3.2)
 * - Membership progress bar with hours visualisation
 * - Gems balance display and notes timeline
 *
 * Tech Stack   : React, TypeScript, Tailwind CSS, shadcn/ui
 * Layer        : Frontend
 *
 * Dependencies : @/components/admin/StatusBadge, @/lib/admin/bookings, next/link
 *
 * Notes        : Notes are sent with the branch the page was rendered for, so a
 *                tab left open across a branch switch is refused (R2.4).
 ************************************************************/

'use client'

import type { CustomerHistoryEntry, CustomerNoteView, NoteVisibility } from '@rgss/types'
import { X } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useMemo, useState } from 'react'
import { StatusBadge } from '@/components/admin/StatusBadge'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import { formatDateDDMMYYYY, formatINR } from '@/lib/admin/bookings'

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

/** The branch the profile was rendered for. */
export interface ProfileBranch {
  id: string
  name: string
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

const TABS = [
  { id: 'history', label: 'History' },
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
  branch,
  tags,
  allTags,
  gemsBalance,
  history,
  invoices,
  membership,
  notes,
}: {
  customerId: string
  branch: ProfileBranch
  tags: ProfileTag[]
  allTags: TagOption[]
  gemsBalance: number
  history: CustomerHistoryEntry[]
  invoices: InvoiceRow[]
  membership: MembershipData
  notes: CustomerNoteView[]
}) {
  const [tab, setTab] = useState<TabId>('history')

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
                className={`px-4 py-2 text-sm font-ui transition-colors border-b-2 -mb-px focus:outline-none focus:ring-2 focus:ring-deep-gold rounded-t-cards ${
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
          {tab === 'history' && <HistoryPanel branch={branch} history={history} />}
          {tab === 'invoices' && <InvoicesPanel branch={branch} invoices={invoices} />}
          {tab === 'membership' && <MembershipPanel membership={membership} />}
          {tab === 'gems' && <GemsPanel gemsBalance={gemsBalance} />}
          {tab === 'notes' && (
            <NotesPanel customerId={customerId} branch={branch} initialNotes={notes} />
          )}
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
        const res = await fetch(`/api/customers/${customerId}/tags/${tagId}`, {
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
        const res = await fetch(`/api/customers/${customerId}/tags`, {
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
      const res = await fetch('/api/tags', {
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
      setCatalogue((prev) => (prev.some((t) => t.id === created.id) ? prev : [...prev, created]))
      await assign(created)
    } catch (err: unknown) {
      setTagError(err instanceof Error ? err.message : 'Could not create this tag.')
      setBusy(false)
    }
  }, [query, assign])

  return (
    <section className="border border-cloud-gray rounded-cards bg-canvas-white p-5 space-y-2">
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
                <Icon icon={X} decorative size={12} />
              </button>
            </span>
          ))
        )}

        {adding ? (
          <div className="relative">
            <Input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search or create a tag…"
              autoFocus
              aria-label="Add a tag"
              className="h-8 w-auto"
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
              <ul className="absolute z-10 mt-1 w-56 max-h-56 overflow-y-auto rounded-cards border border-cloud-gray bg-canvas-white shadow-sm py-1">
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

// Row keys for the history table. Other branches' visits carry no booking id,
// so their key is what they show; identical visits get a counter.
function withRowKeys(history: CustomerHistoryEntry[]) {
  const seen = new Map<string, number>()
  return history.map((entry) => {
    const base =
      entry.scope === 'this_branch'
        ? entry.bookingId
        : `${entry.branchName}|${entry.bookingDate}|${entry.startTime}|${entry.services.join(',')}`
    const count = (seen.get(base) ?? 0) + 1
    seen.set(base, count)
    return { key: count === 1 ? base : `${base}#${count}`, entry }
  })
}

// --- History tab: this branch's bookings + other branches' visits ---
function HistoryPanel({
  branch,
  history,
}: {
  branch: ProfileBranch
  history: CustomerHistoryEntry[]
}) {
  if (history.length === 0) {
    return <EmptyPanel message="No visits or bookings yet." />
  }
  return (
    <div className="space-y-2">
      <p className="text-xs font-sans text-dusty-gray">
        Amounts are shown for {branch.name} only. Other branches&apos; visits show the date and
        services.
      </p>
      <div className="border border-cloud-gray rounded-cards overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-cloud-gray/60">
                <Th>Date</Th>
                <Th>Branch</Th>
                <Th>Services</Th>
                <Th>Type</Th>
                <Th>Status</Th>
                <Th>Amount</Th>
                <Th>Booking #</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cloud-gray">
              {withRowKeys(history).map(({ key, entry }) => {
                const services = entry.services.length > 0 ? entry.services.join(', ') : '—'
                const type = entry.serviceType === 'spa' ? 'SPA' : 'Salon'
                if (entry.scope === 'other_branch') {
                  return (
                    <tr key={key} className="hover:bg-cloud-gray/30 transition-colors">
                      <td className="px-4 py-3 font-sans text-warm-gray whitespace-nowrap">
                        {formatDateDDMMYYYY(entry.bookingDate)}
                      </td>
                      <td className="px-4 py-3 font-sans text-warm-gray whitespace-nowrap">
                        {entry.branchName}
                      </td>
                      <td className="px-4 py-3 font-sans text-cocoa-dark">{services}</td>
                      <td className="px-4 py-3 font-sans text-warm-gray whitespace-nowrap">
                        {type}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status="completed" />
                      </td>
                      <td className="px-4 py-3 font-sans text-dusty-gray whitespace-nowrap">
                        <span aria-hidden="true">—</span>
                        <span className="sr-only">Not shown for another branch</span>
                      </td>
                      <td className="px-4 py-3 font-sans text-dusty-gray whitespace-nowrap">
                        <span aria-hidden="true">—</span>
                      </td>
                    </tr>
                  )
                }
                return (
                  <tr key={key} className="hover:bg-cloud-gray/30 transition-colors">
                    <td className="px-4 py-3 font-sans text-warm-gray whitespace-nowrap">
                      {formatDateDDMMYYYY(entry.bookingDate)}
                    </td>
                    <td className="px-4 py-3 font-sans text-warm-gray whitespace-nowrap">
                      {branch.name}
                    </td>
                    <td className="px-4 py-3 font-sans text-cocoa-dark">{services}</td>
                    <td className="px-4 py-3 font-sans text-warm-gray whitespace-nowrap">
                      {type}
                      {entry.isMembershipSession ? ' · Session' : ''}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={entry.status} />
                    </td>
                    <td className="px-4 py-3 font-ui text-cocoa-dark whitespace-nowrap">
                      {formatINR(entry.totalAmountPaise)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-cocoa-dark whitespace-nowrap">
                      <Link
                        href={`/bookings/${entry.bookingId}`}
                        className="text-deep-gold hover:text-cocoa-dark transition-colors"
                      >
                        {entry.bookingNumber}
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// --- Invoices tab: the active branch's invoices only ---
function InvoicesPanel({ branch, invoices }: { branch: ProfileBranch; invoices: InvoiceRow[] }) {
  if (invoices.length === 0) {
    return <EmptyPanel message={`No invoices at ${branch.name} yet.`} />
  }
  return (
    <div className="border border-cloud-gray rounded-cards overflow-hidden">
      <p className="px-4 py-2 text-xs font-sans text-dusty-gray border-b border-cloud-gray">
        Invoices raised at {branch.name}.
      </p>
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
      className={`border rounded-cards bg-canvas-white p-4 ${
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
    <div className="border border-cloud-gray rounded-cards bg-canvas-white p-5">
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
  branch,
  initialNotes,
}: {
  customerId: string
  branch: ProfileBranch
  initialNotes: CustomerNoteView[]
}) {
  const [notes, setNotes] = useState<CustomerNoteView[]>(initialNotes)
  const [content, setContent] = useState('')
  // Private to this branch unless the writer chooses to share (R3.1).
  const [visibility, setVisibility] = useState<NoteVisibility>('branch')
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
      const res = await fetch(`/api/customers/${customerId}/notes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ branchId: branch.id, content: trimmed, visibility }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? 'Could not save this note.')
      }
      const saved = json.data.note as Pick<
        CustomerNoteView,
        'id' | 'content' | 'visibility' | 'branchName' | 'createdAt'
      >
      setNotes((prev) => [{ ...saved, authorName: 'You' }, ...prev])
      setContent('')
    } catch (err: unknown) {
      setNoteError(err instanceof Error ? err.message : 'Could not save this note.')
    } finally {
      setSubmitting(false)
    }
  }, [branch.id, content, customerId, visibility])

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="space-y-2">
        <label
          htmlFor="note-content"
          className="text-[10px] font-ui uppercase tracking-wider text-dusty-gray"
        >
          Add a note
        </label>
        <Textarea
          id="note-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="Add a note about this customer…"
        />
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 font-ui text-[10px] uppercase tracking-wider text-dusty-gray">
            Who can read it
          </legend>
          <RadioGroup
            value={visibility}
            onValueChange={(v) => setVisibility(v === 'shared' ? 'shared' : 'branch')}
            aria-label="Who can read this note"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem id="note-visibility-branch" value="branch" />
              <Label
                htmlFor="note-visibility-branch"
                className="cursor-pointer font-sans text-sm text-cocoa-dark"
              >
                {branch.name} only
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem id="note-visibility-shared" value="shared" />
              <Label
                htmlFor="note-visibility-shared"
                className="cursor-pointer font-sans text-sm text-cocoa-dark"
              >
                All Royal Glow branches
              </Label>
            </div>
          </RadioGroup>
        </fieldset>
        {noteError && (
          <p className="text-xs text-error font-sans" role="alert">
            {noteError}
          </p>
        )}
        <Button
          type="button"
          onClick={addNote}
          disabled={submitting}
          aria-busy={submitting}
          className="font-ui"
        >
          {submitting ? 'Saving…' : 'Save Note'}
        </Button>
      </div>

      <div className="space-y-3">
        {notes.length === 0 ? (
          <p className="text-sm text-dusty-gray font-sans">No notes yet.</p>
        ) : (
          notes.map((n) => (
            <div key={n.id} className="border border-cloud-gray rounded-cards bg-canvas-white p-3">
              <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="text-[11px] font-ui uppercase tracking-wider text-dusty-gray">
                  {formatDateDDMMYYYY(n.createdAt)} · {n.authorName}
                  {n.branchName ? ` · ${n.branchName}` : ''}
                </p>
                <span className="inline-flex items-center rounded-pill bg-golden-mist px-2 py-0.5 font-ui text-[11px] text-warm-gray">
                  {n.visibility === 'shared'
                    ? 'All branches'
                    : `${n.branchName ?? branch.name} only`}
                </span>
              </div>
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
    <div className="border border-cloud-gray rounded-cards bg-canvas-white px-5 py-12 text-center">
      <p className="font-sans text-sm text-dusty-gray">{message}</p>
    </div>
  )
}
