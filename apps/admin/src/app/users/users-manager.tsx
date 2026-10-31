/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 28-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Users Manager
 * Scope        : Admin Portal — Users & Roles at the active branch (R1.4, R1.5)
 *
 * Description  : Who runs the active branch: its Owner, Manager and
 *                Receptionist, each on a card with Change (find a person and
 *                confirm) and, for the Manager and Receptionist, Remove. The
 *                Developer changes the Owner; the branch's Owner or the
 *                Developer changes the Manager and Receptionist. Stylists and
 *                Therapists are managed on the Staff page.
 *
 * Responsibilities :
 * - Load the branch's holders from GET /api/users/branch-roles
 * - Change a holder: person search (GET /api/users?search=) + confirmation,
 *   then POST /api/users { kind, branchId, userId, expectedHolderId }
 * - Remove the Manager or Receptionist with a confirmation
 *
 * Features / Functionality :
 * - Only the people the server says can take the role are pickable; the
 *   others say why, without naming another branch
 * - Every change sends the branch the page was rendered for and the holder
 *   it showed, so a switch or a concurrent change is refused, not overwritten
 * - Accessible status messaging (role="alert" / aria-live) + toasts
 *
 * Tech Stack   : Next.js 16, React (Client Component), TypeScript
 * Layer        : Presentation (Management Component)
 *
 * Notes        : The server re-plans every change from current rows; this
 *                screen only shows what it was told. Uses ONLY semantic
 *                Brand-Token utilities; lucide icons via the Icon wrapper.
 ************************************************************/

'use client'

import { cn } from '@rgss/ui/lib/utils'
import { Building2, Lock, UserRound } from 'lucide-react'
import { useCallback, useState } from 'react'
import { type PersonMatch, PersonSearch, personLabel } from '@/components/people/person-search'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Icon } from '@/components/ui/icon'
import { ErrorState } from '@/components/ui/state/error-state'
import { Skeleton } from '@/components/ui/state/skeleton'
import { StatusBadge } from '@/components/ui/status-badge'
import { useAsyncData } from '@/components/ui/use-async-data'
import { reassignmentsNotice } from '@/lib/admin/bookings'
import { adminPagesForRole } from '@/lib/admin/role-access'
import { toast } from '@/lib/admin/toast'
import { liveUpdatesNotice } from '@/lib/realtime/token-lifetime'

type Holder = 'owner' | 'manager' | 'receptionist'
type SetKind = 'set_owner' | 'set_manager' | 'set_receptionist'

/** GET /api/users/branch-roles */
interface BranchRoles {
  branch: { id: string; name: string; code: string; status: string }
  owner: PersonMatch | null
  manager: PersonMatch | null
  receptionist: PersonMatch | null
  can: { setOwner: boolean; setManager: boolean; setReceptionist: boolean }
}

/** One match from GET /api/users?search= */
interface RoleMatch extends PersonMatch {
  /** The role they hold at this branch, if any. */
  here: Holder | 'staff' | null
  /** The roles they can be given here. */
  actions: SetKind[]
  /** Why they can't be given any, or a note about them. */
  note: string | null
}

type Pending =
  | { mode: 'change'; holder: Holder; person: RoleMatch }
  | { mode: 'remove'; holder: Exclude<Holder, 'owner'>; person: PersonMatch }

const HOLDERS: readonly Holder[] = ['owner', 'manager', 'receptionist']

const LABEL: Record<Holder | 'staff', string> = {
  owner: 'Owner',
  manager: 'Manager',
  receptionist: 'Receptionist',
  staff: 'Staff',
}

const KIND: Record<Holder, SetKind> = {
  owner: 'set_owner',
  manager: 'set_manager',
  receptionist: 'set_receptionist',
}

const CAN: Record<Holder, keyof BranchRoles['can']> = {
  owner: 'setOwner',
  manager: 'setManager',
  receptionist: 'setReceptionist',
}

const DUTY: Record<Holder, string> = {
  owner: 'Owns the branch: chooses its Manager and Receptionist and sees its reports.',
  manager: 'Runs the branch day to day: staff, schedules, leave and reports.',
  receptionist: 'Handles bookings, billing and customers at the counter.',
}

const LOCKED: Record<Holder, string> = {
  owner: 'Only the Developer can change the Owner.',
  manager: "Only the branch's Owner or the Developer can change the Manager.",
  receptionist: "Only the branch's Owner or the Developer can change the Receptionist.",
}

// What happens to the person being replaced or removed.
const AFTERWARDS: Record<Holder, string> = {
  owner:
    'They stay Owner of any other branch they own. With none left, they become a Customer and are signed out.',
  manager:
    'They keep any other branch they manage. With none left, they become a Customer and are signed out.',
  receptionist: 'They become a Customer and are signed out.',
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const json = await res.json().catch(() => null)
  if (!res.ok || !json?.success) {
    throw new Error(json?.error?.message ?? 'Something went wrong. Please try again.')
  }
  return json.data as T
}

const fetchBranchRoles = () => api<BranchRoles>('/api/users/branch-roles')

const searchPeople = (term: string, signal: AbortSignal) =>
  api<{ users: RoleMatch[] }>(`/api/users?search=${encodeURIComponent(term)}`, { signal }).then(
    (data) => data.users,
  )

export function UsersManager() {
  const { state, retry } = useAsyncData(fetchBranchRoles)
  const [changing, setChanging] = useState<Holder | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)

  const done = useCallback(() => {
    setPending(null)
    setChanging(null)
    retry()
  }, [retry])

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-2xl tracking-tight text-cocoa-dark">Users &amp; Roles</h1>
        <p className="mt-0.5 font-sans text-sm text-dusty-gray">
          Who runs this branch. The Developer sets the Owner; the Owner chooses the Manager and the
          Receptionist. Stylists and Therapists are added on the Staff page. A person must sign in
          on theroyalglow.in once before they can be given a role.
        </p>
      </div>

      {state.status === 'loading' ? (
        <Skeleton rows={3} variant="table" />
      ) : state.status === 'error' ? (
        <ErrorState message={state.message} onRetry={retry} />
      ) : (
        <>
          <p className="flex items-center gap-2 font-sans text-sm text-cocoa-dark">
            <Icon icon={Building2} decorative size={16} className="text-warm-gray" />
            <span className="font-ui font-medium">{state.data.branch.name}</span>
            {state.data.branch.status !== 'operational' ? (
              <StatusBadge status={state.data.branch.status} />
            ) : null}
          </p>
          <div className="space-y-4">
            {HOLDERS.map((holder) => (
              <HolderCard
                key={holder}
                holder={holder}
                roles={state.data}
                changing={changing === holder}
                onChange={() => setChanging(changing === holder ? null : holder)}
                onPick={(person) => setPending({ mode: 'change', holder, person })}
                onRemove={(person) =>
                  holder === 'owner' ? undefined : setPending({ mode: 'remove', holder, person })
                }
              />
            ))}
          </div>
          {pending ? (
            <ConfirmDialog
              pending={pending}
              roles={state.data}
              onCancel={() => setPending(null)}
              onDone={done}
            />
          ) : null}
        </>
      )}
    </div>
  )
}

/* ── One role at the branch ─────────────────────────────────────────────── */

function HolderCard({
  holder,
  roles,
  changing,
  onChange,
  onPick,
  onRemove,
}: {
  holder: Holder
  roles: BranchRoles
  changing: boolean
  onChange: () => void
  onPick: (person: RoleMatch) => void
  onRemove: (person: PersonMatch) => void
}) {
  const current = roles[holder]
  const allowed = roles.can[CAN[holder]]
  const label = LABEL[holder]
  const headingId = `holder-${holder}`

  const status = useCallback(
    (match: RoleMatch) => {
      const pickable = match.actions.includes(KIND[holder])
      if (match.here === holder) {
        return { pickable: false, text: `Already the ${label}` }
      }
      if (!pickable) {
        return { pickable, text: match.note ?? 'Not available' }
      }
      return { pickable, text: match.here ? `${LABEL[match.here]} here` : null }
    },
    [holder, label],
  )

  return (
    <section
      aria-labelledby={headingId}
      className="space-y-3 rounded-cards border border-cloud-gray bg-canvas-white p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={headingId} className="font-display text-lg tracking-tight text-cocoa-dark">
            {label}
          </h2>
          <p className="font-sans text-xs text-dusty-gray">{DUTY[holder]}</p>
        </div>
        {allowed ? (
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onChange}
              aria-expanded={changing}
              className="rounded-buttons border border-cloud-gray px-3 py-1.5 font-ui text-xs text-cocoa-dark transition-colors hover:bg-cloud-gray motion-reduce:transition-none"
            >
              {changing ? 'Cancel' : current ? 'Change' : `Choose ${label}`}
            </button>
            {current && holder !== 'owner' ? (
              <button
                type="button"
                onClick={() => onRemove(current)}
                className="rounded-buttons px-3 py-1.5 font-ui text-xs text-error transition-colors hover:bg-error/10 motion-reduce:transition-none"
              >
                Remove
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-2.5 rounded-cards border border-cloud-gray px-3 py-2.5">
        <Icon icon={UserRound} decorative size={18} className="shrink-0 text-warm-gray" />
        {current ? (
          <span className="min-w-0">
            <span className="block truncate font-sans text-sm text-cocoa-dark">
              {personLabel(current)}
            </span>
            <span className="block truncate font-sans text-xs text-dusty-gray">
              {current.phone ? `${current.email} · ${current.phone}` : current.email}
            </span>
          </span>
        ) : (
          <span className="font-sans text-sm text-dusty-gray">No {label} yet.</span>
        )}
      </div>

      {!allowed ? (
        <p className="flex items-center gap-2 font-sans text-xs text-warm-gray">
          <Icon icon={Lock} decorative size={14} />
          {LOCKED[holder]}
        </p>
      ) : changing ? (
        <PersonSearch<RoleMatch>
          label={`Find the new ${label}`}
          search={searchPeople}
          status={status}
          onPick={onPick}
        />
      ) : null}
    </section>
  )
}

/* ── Confirmation ───────────────────────────────────────────────────────── */

function ConfirmDialog({
  pending,
  roles,
  onCancel,
  onDone,
}: {
  pending: Pending
  roles: BranchRoles
  onCancel: () => void
  onDone: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { holder, person } = pending
  const label = LABEL[holder]
  const branch = roles.branch.name
  const current = roles[holder]
  const removing = pending.mode === 'remove'

  const title = removing
    ? `Remove ${personLabel(person)} as ${label}?`
    : `Make ${personLabel(person)} the ${label} of ${branch}?`

  const confirm = async () => {
    setBusy(true)
    setError(null)
    try {
      const body = removing
        ? { kind: 'remove', branchId: roles.branch.id, userId: person.id }
        : {
            kind: KIND[holder],
            branchId: roles.branch.id,
            userId: person.id,
            expectedHolderId: current?.id ?? null,
          }
      const result = await api<{
        changed: boolean
        liveUpdates?: string
        reassignments?: number
      }>('/api/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const summary = removing
        ? `${personLabel(person)} is no longer the ${label} of ${branch}.`
        : `${personLabel(person)} is now the ${label} of ${branch}.`
      toast.success(summary)
      // A replaced or removed Manager or Receptionist leaves their bookings
      // here for someone else (R1.7).
      const moved = reassignmentsNotice(result.reassignments)
      if (moved) {
        toast.warning(moved)
      }
      const notice = liveUpdatesNotice(result.liveUpdates)
      if (notice) {
        toast.warning(notice)
      }
      onDone()
    } catch (err: unknown) {
      const text = err instanceof Error ? err.message : 'Could not change the role.'
      setError(text)
      toast.error('Could not change the role', text)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AlertDialog open onOpenChange={(open) => !open && !busy && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display tracking-tight text-cocoa-dark">
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 font-sans text-sm text-warm-gray">
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 rounded-cards border border-cloud-gray p-3 text-left">
                <dt className="text-dusty-gray">Name</dt>
                <dd className="text-cocoa-dark">{personLabel(person)}</dd>
                <dt className="text-dusty-gray">Email</dt>
                <dd className="break-all text-cocoa-dark">{person.email}</dd>
                <dt className="text-dusty-gray">Phone</dt>
                <dd className="text-cocoa-dark">{person.phone ?? 'Not on file'}</dd>
                <dt className="text-dusty-gray">Branch</dt>
                <dd className="text-cocoa-dark">{branch}</dd>
                {removing ? null : (
                  <>
                    <dt className="text-dusty-gray">Admin pages</dt>
                    <dd className="text-cocoa-dark">{adminPagesForRole(holder).join(', ')}</dd>
                  </>
                )}
              </dl>
              {removing ? (
                <p>
                  They stop being the {label} here. {AFTERWARDS[holder]} Their account and history
                  are kept.
                </p>
              ) : (
                <>
                  <p>
                    They get {label} access to the admin portal for {branch}.
                  </p>
                  {current ? (
                    <p>
                      {personLabel(current)} stops being the {label} here. {AFTERWARDS[holder]}
                    </p>
                  ) : null}
                </>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {error ? (
          <p className="font-sans text-sm text-error" role="alert">
            {error}
          </p>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(event) => {
              // Keep the dialog open while the request runs; it closes on success.
              event.preventDefault()
              confirm()
            }}
            className={cn(removing && 'bg-error text-canvas-white hover:bg-error/90')}
          >
            {busy ? 'Saving…' : removing ? 'Remove' : `Make ${label}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
