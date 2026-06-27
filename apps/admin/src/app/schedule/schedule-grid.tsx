/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Schedule Grid
 * Scope        : Admin Portal — Schedule Management
 *
 * Description  : Weekly staff schedule grid rebuilt on the admin design-system
 *                primitives. The schedule is a staff × day matrix (not a record
 *                list), so it keeps its purpose-built grid while adopting the
 *                shared state presenters for loading / empty / error, the
 *                StatusBadge for the on-leave indicator, and useAsyncData for
 *                fetch orchestration + timeout. Inline schedule editing, week
 *                navigation, leave overlays, and booking counts are preserved.
 *                Consumes GET/PUT /api/schedule as-is.
 *
 * Responsibilities :
 * - Fetch weekly schedule data (staff, working hours, leave, bookings)
 * - Render the 7-column grid with staff rows and day columns
 * - Provide the inline schedule editor (per-day working hours toggle)
 *
 * Features / Functionality :
 * - Week navigation (prev/next/today) with range label
 * - Per-staff inline edit mode with time inputs and validation
 * - Leave-day StatusBadge indicators and booking counts per cell
 *
 * Tech Stack   : Next.js 16, React (Client Component), TypeScript,
 *                Tailwind CSS v4 (Brand Tokens), lucide-react
 * Layer        : Presentation (Schedule Grid Component)
 *
 * Dependencies : @/components/ui/state/*, @/components/ui/status-badge,
 *                @/components/ui/use-async-data, @/components/ui/icon,
 *                @/lib/admin/bookings (formatTime12h), React hooks
 *
 * Notes        : Presentation-layer only — no API/RBAC/data-model/business-logic
 *                changes. Uses ONLY semantic Brand-Token utilities and lucide
 *                icons via the Icon wrapper — no emoji / hex / raw-palette
 *                literals. All date arithmetic uses UTC to prevent timezone
 *                drift. Every pre-redesign field and action is preserved
 *                (Req 17.6, 17.7).
 *
 * Requirements : 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7
 ************************************************************/

'use client'

import { Icon } from '@/components/ui/icon'
import { EmptyState } from '@/components/ui/state/empty-state'
import { ErrorState } from '@/components/ui/state/error-state'
import { Skeleton } from '@/components/ui/state/skeleton'
import { StatusBadge } from '@/components/ui/status-badge'
import { useAsyncData } from '@/components/ui/use-async-data'
import { formatTime12h } from '@/lib/admin/bookings'
import { CalendarRange, ChevronLeft, ChevronRight } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

// ─── API shapes (mirror GET /api/schedule → apiSuccess({ dates, staff })) ───

interface ScheduleEntry {
  id: string
  staffId: string
  dayOfWeek: number
  startTime: string | null
  endTime: string | null
  isWorking: boolean
}

interface StaffWeekRow {
  staff: { id: string; userId: string; name: string }
  schedule: ScheduleEntry[]
  leaveDates: string[]
  bookingCountsByDate: Record<string, number>
}

interface GridData {
  dates: string[]
  staff: StaffWeekRow[]
}

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const DAY_LONG = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const
const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

// ─── Date helpers (UTC arithmetic so calendar dates never drift) ───

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function startOfWeekISO(iso: string): string {
  const d = new Date(`${iso}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() - d.getUTCDay())
  return d.toISOString().slice(0, 10)
}

function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function dayOfWeekOf(iso: string): number {
  return new Date(`${iso}T00:00:00.000Z`).getUTCDay()
}

function formatRangeLabel(weekStart: string): string {
  const end = addDaysISO(weekStart, 6)
  const s = new Date(`${weekStart}T00:00:00.000Z`)
  const e = new Date(`${end}T00:00:00.000Z`)
  const sLabel = `${s.getUTCDate()} ${MONTH_SHORT[s.getUTCMonth()]}`
  const eLabel = `${e.getUTCDate()} ${MONTH_SHORT[e.getUTCMonth()]} ${e.getUTCFullYear()}`
  return `${sLabel} – ${eLabel}`
}

// "HH:MM:SS" | "HH:MM" | null → "HH:MM" | '' (for <input type="time">).
function toHHMM(value: string | null): string {
  if (!value) {
    return ''
  }
  return value.slice(0, 5)
}

function workingHoursLabel(entry: ScheduleEntry | undefined): string | null {
  if (!entry || !entry.isWorking || !entry.startTime || !entry.endTime) {
    return null
  }
  return `${formatTime12h(entry.startTime)} – ${formatTime12h(entry.endTime)}`
}

// The 7-entry editor state, indexed by dayOfWeek 0..6.
type EditorEntry = { isWorking: boolean; startTime: string; endTime: string }

function buildEditorEntries(schedule: ScheduleEntry[]): EditorEntry[] {
  const byDay = new Map<number, ScheduleEntry>()
  for (const row of schedule) {
    byDay.set(row.dayOfWeek, row)
  }
  return Array.from({ length: 7 }, (_, day) => {
    const row = byDay.get(day)
    return {
      isWorking: row?.isWorking ?? false,
      startTime: toHHMM(row?.startTime ?? null),
      endTime: toHHMM(row?.endTime ?? null),
    }
  })
}

async function fetchSchedule(weekStart: string): Promise<GridData> {
  const res = await fetch(`/api/schedule?weekStart=${weekStart}`)
  const json = await res.json()
  if (!res.ok || !json.success) {
    throw new Error(json?.error?.message ?? 'Could not load the schedule.')
  }
  return json.data as GridData
}

export function ScheduleGrid() {
  const [weekStart, setWeekStart] = useState(() => startOfWeekISO(todayISO()))
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null)

  const fetcher = useCallback(() => fetchSchedule(weekStart), [weekStart])
  const { state, retry } = useAsyncData(fetcher)

  // Re-request when the week changes; the initial mount fetch is owned by the
  // hook, so skip the very first effect run to avoid a duplicate request.
  const didMount = useRef(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: weekStart is the re-fetch trigger; retry reads the latest fetcher via ref
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true
      return
    }
    retry()
  }, [weekStart, retry])

  const goToday = () => setWeekStart(startOfWeekISO(todayISO()))
  const goPrev = () => setWeekStart((w) => addDaysISO(w, -7))
  const goNext = () => setWeekStart((w) => addDaysISO(w, 7))

  return (
    <div className="space-y-5">
      {/* Header + week navigator */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl tracking-tight text-cocoa-dark">Schedule</h1>
          <p className="mt-0.5 font-sans text-sm text-dusty-gray">
            Week of {formatRangeLabel(weekStart)}
          </p>
        </div>

        <fieldset className="m-0 flex min-w-0 items-center gap-1 border-0 p-0">
          <legend className="sr-only">Change week</legend>
          <button
            type="button"
            onClick={goPrev}
            className="inline-flex h-9 items-center gap-1 rounded-buttons border border-outline-gray bg-canvas-white px-3 font-ui text-sm text-warm-gray transition-colors hover:bg-cloud-gray motion-reduce:transition-none"
          >
            <Icon icon={ChevronLeft} decorative size={16} />
            Prev
          </button>
          <button
            type="button"
            onClick={goToday}
            className="h-9 rounded-buttons border border-outline-gray bg-canvas-white px-3 font-ui text-sm text-cocoa-dark transition-colors hover:bg-cloud-gray motion-reduce:transition-none"
          >
            Today
          </button>
          <button
            type="button"
            onClick={goNext}
            className="inline-flex h-9 items-center gap-1 rounded-buttons border border-outline-gray bg-canvas-white px-3 font-ui text-sm text-warm-gray transition-colors hover:bg-cloud-gray motion-reduce:transition-none"
          >
            Next
            <Icon icon={ChevronRight} decorative size={16} />
          </button>
        </fieldset>
      </div>

      {state.status === 'loading' ? (
        <Skeleton rows={6} variant="table" />
      ) : state.status === 'error' ? (
        <ErrorState message={state.message} onRetry={retry} />
      ) : state.data.staff.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title="No active staff"
          message="Add staff members to manage their weekly schedules."
        />
      ) : (
        <div className="overflow-hidden rounded-cards border border-cloud-gray">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-cloud-gray/60">
                  <th className="sticky left-0 z-10 bg-cloud-gray/60 px-4 py-2.5 text-left font-ui text-xs uppercase tracking-wider text-dusty-gray">
                    Staff
                  </th>
                  {state.data.dates.map((date) => {
                    const dow = dayOfWeekOf(date)
                    const dayNum = new Date(`${date}T00:00:00.000Z`).getUTCDate()
                    return (
                      <th
                        key={date}
                        scope="col"
                        className="whitespace-nowrap px-3 py-2.5 text-center font-ui text-xs uppercase tracking-wider text-dusty-gray"
                      >
                        <span className="block text-cocoa-dark">{DAY_SHORT[dow]}</span>
                        <span className="block font-sans text-[11px] normal-case tracking-normal text-warm-stone">
                          {dayNum}
                        </span>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-cloud-gray">
                {state.data.staff.map((row) => (
                  <StaffRow
                    key={row.staff.id}
                    row={row}
                    dates={state.data.dates}
                    isEditing={editingStaffId === row.staff.id}
                    onEdit={() => setEditingStaffId(row.staff.id)}
                    onCancel={() => setEditingStaffId(null)}
                    onSaved={() => {
                      setEditingStaffId(null)
                      retry()
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function StaffRow({
  row,
  dates,
  isEditing,
  onEdit,
  onCancel,
  onSaved,
}: {
  row: StaffWeekRow
  dates: string[]
  isEditing: boolean
  onEdit: () => void
  onCancel: () => void
  onSaved: () => void
}) {
  const scheduleByDay = useMemo(() => {
    const map = new Map<number, ScheduleEntry>()
    for (const entry of row.schedule) {
      map.set(entry.dayOfWeek, entry)
    }
    return map
  }, [row.schedule])

  const leaveSet = useMemo(() => new Set(row.leaveDates), [row.leaveDates])

  return (
    <>
      <tr className="align-top transition-colors hover:bg-cloud-gray/30 motion-reduce:transition-none">
        <th
          scope="row"
          className="sticky left-0 z-10 whitespace-nowrap bg-canvas-white px-4 py-3 text-left font-sans text-cocoa-dark"
        >
          <div className="flex items-center justify-between gap-3">
            <span>{row.staff.name}</span>
            {!isEditing && (
              <button
                type="button"
                onClick={onEdit}
                className="font-ui text-xs text-deep-gold transition-colors hover:text-cocoa-dark motion-reduce:transition-none"
                aria-label={`Edit schedule for ${row.staff.name}`}
              >
                Edit
              </button>
            )}
          </div>
        </th>

        {dates.map((date) => {
          const dow = dayOfWeekOf(date)
          const entry = scheduleByDay.get(dow)
          const hours = workingHoursLabel(entry)
          const onLeave = leaveSet.has(date)
          const count = row.bookingCountsByDate[date] ?? 0

          return (
            <td key={date} className="px-3 py-3 text-center align-top">
              <div className="flex flex-col items-center gap-1">
                {onLeave && <StatusBadge status="leave" />}
                {hours ? (
                  <span className="whitespace-nowrap font-ui text-xs text-deep-gold">{hours}</span>
                ) : (
                  <span className="font-ui text-[11px] uppercase tracking-[0.5px] text-warm-stone">
                    Off
                  </span>
                )}
                {count > 0 && (
                  <span className="font-sans text-[11px] text-warm-gray">
                    {count} booking{count === 1 ? '' : 's'}
                  </span>
                )}
              </div>
            </td>
          )
        })}
      </tr>

      {isEditing && (
        <tr>
          <td colSpan={dates.length + 1} className="bg-warm-cream/40 px-4 py-4">
            <ScheduleEditor
              staffId={row.staff.id}
              staffName={row.staff.name}
              initialSchedule={row.schedule}
              onCancel={onCancel}
              onSaved={onSaved}
            />
          </td>
        </tr>
      )}
    </>
  )
}

function ScheduleEditor({
  staffId,
  staffName,
  initialSchedule,
  onCancel,
  onSaved,
}: {
  staffId: string
  staffName: string
  initialSchedule: ScheduleEntry[]
  onCancel: () => void
  onSaved: () => void
}) {
  const [entries, setEntries] = useState<EditorEntry[]>(() => buildEditorEntries(initialSchedule))
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const updateEntry = (day: number, patch: Partial<EditorEntry>) => {
    setEntries((prev) => prev.map((entry, idx) => (idx === day ? { ...entry, ...patch } : entry)))
  }

  // Mirror the server-side rule (assertValidScheduleEntry): a working day needs a
  // start and end with start < end. Surfaced inline before the PUT.
  const validationError = useMemo(() => {
    for (let day = 0; day < entries.length; day++) {
      const e = entries[day]
      if (!e || !e.isWorking) {
        continue
      }
      if (!e.startTime || !e.endTime) {
        return `${DAY_LONG[day]}: set both a start and end time.`
      }
      if (e.startTime >= e.endTime) {
        return `${DAY_LONG[day]}: start time must be before end time.`
      }
    }
    return null
  }, [entries])

  const save = async () => {
    if (validationError) {
      setSaveError(validationError)
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const payload = {
        staffId,
        entries: entries.map((e, day) => ({
          dayOfWeek: day,
          isWorking: e.isWorking,
          startTime: e.isWorking ? e.startTime : null,
          endTime: e.isWorking ? e.endTime : null,
        })),
      }
      const res = await fetch('/api/schedule', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? 'Could not save the schedule.')
      }
      onSaved()
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Could not save the schedule.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="font-ui text-sm text-cocoa-dark">Edit weekly schedule — {staffName}</h3>

      <ul className="space-y-2">
        {entries.map((entry, day) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: index IS the dayOfWeek (0..6), a stable key
          <li key={day} className="flex flex-wrap items-center gap-3">
            <label className="flex w-[150px] shrink-0 items-center gap-2 font-sans text-sm text-cocoa-dark">
              <input
                type="checkbox"
                checked={entry.isWorking}
                onChange={(e) => updateEntry(day, { isWorking: e.target.checked })}
                className="h-4 w-4 rounded-cards border-outline-gray accent-deep-gold focus:ring-deep-gold"
              />
              {DAY_LONG[day]}
            </label>

            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5">
                <span className="font-ui text-[11px] uppercase tracking-wider text-dusty-gray">
                  From
                </span>
                <input
                  type="time"
                  value={entry.startTime}
                  disabled={!entry.isWorking}
                  onChange={(e) => updateEntry(day, { startTime: e.target.value })}
                  className="h-9 rounded-buttons border border-outline-gray bg-canvas-white px-2 font-sans text-sm text-cocoa-dark focus:outline-none focus:ring-2 focus:ring-deep-gold disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label={`${DAY_LONG[day]} start time`}
                />
              </label>
              <label className="flex items-center gap-1.5">
                <span className="font-ui text-[11px] uppercase tracking-wider text-dusty-gray">
                  To
                </span>
                <input
                  type="time"
                  value={entry.endTime}
                  disabled={!entry.isWorking}
                  onChange={(e) => updateEntry(day, { endTime: e.target.value })}
                  className="h-9 rounded-buttons border border-outline-gray bg-canvas-white px-2 font-sans text-sm text-cocoa-dark focus:outline-none focus:ring-2 focus:ring-deep-gold disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label={`${DAY_LONG[day]} end time`}
                />
              </label>
            </div>
          </li>
        ))}
      </ul>

      {(saveError || validationError) && (
        <p className="font-sans text-sm text-error" role="alert">
          {saveError ?? validationError}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="h-9 rounded-buttons bg-cocoa-dark px-4 font-ui text-sm text-canvas-white transition-colors hover:bg-warm-gray disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none"
        >
          {saving ? 'Saving…' : 'Save schedule'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="h-9 rounded-buttons border border-outline-gray bg-canvas-white px-4 font-ui text-sm text-warm-gray transition-colors hover:bg-cloud-gray disabled:opacity-60 motion-reduce:transition-none"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
