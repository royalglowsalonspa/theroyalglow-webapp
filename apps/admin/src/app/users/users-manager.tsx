/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Users Manager
 * Scope        : Admin Portal — User / RBAC administration
 *
 * Description  : Owner-facing role-management screen rebuilt on the admin
 *                design-system primitives. An assign-role form (email + role)
 *                sits above a searchable account directory rendered with the
 *                reusable DataTable. Each account shows its current role and
 *                access state as semantic Status_Badge pills, and a per-row
 *                "Change role" action opens a SlideOverPanel role editor.
 *                Consumes GET|POST /api/users as-is.
 *
 * Responsibilities :
 * - Assign a role to a user by the email they signed in with (POST /api/users)
 * - List/search all accounts via GET /api/users (server-side search)
 * - Render role + active state via the StatusBadge primitive
 * - Provide a SlideOverPanel role editor per directory row
 * - Surface API guard errors (self-edit, privilege ceiling, unknown email)
 * - Route loading / empty / error through the shared state presenters
 *
 * Features / Functionality :
 * - Assign-role form with role <select> and live validation feedback
 * - FilterBar search (debounced + trimmed) + column-visibility control
 * - DataTable directory with avatar, name, email, role, status, joined
 * - SlideOverPanel inline role editor with optimistic reload after success
 * - Accessible status messaging (role="alert" / aria-live)
 *
 * Tech Stack   : Next.js 16, React (Client Component), TypeScript,
 *                @tanstack/react-table
 * Layer        : Presentation (Management Component)
 *
 * Dependencies : @/components/ui/data-table, @/components/ui/filter-bar,
 *                @/components/ui/status-badge, @/components/ui/slide-over-panel,
 *                @/components/ui/state/*, @/components/ui/use-async-data,
 *                @/lib/admin/bookings, @rgss/types (ASSIGNABLE_ROLES), React
 *
 * Notes        : All mutations go through POST /api/users; the server enforces
 *                the real privilege guards. This UI is a convenience layer.
 *                Presentation-layer only — no API / RBAC / data-model changes.
 *                Uses ONLY semantic Brand-Token utilities (Req 1.2); lucide
 *                icons via the Icon wrapper (Req 2). Requirements 17.1–17.7.
 ************************************************************/

'use client'

import { ASSIGNABLE_ROLES, type AssignableRole } from '@rgss/types'
import type { ColumnVisibilityState } from '@tanstack/react-table'
import { KeyRound, Users } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type AdminColumnDef, DataTable } from '@/components/ui/data-table'
import { type ColumnToggle, FilterBar } from '@/components/ui/filter-bar'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SlideOverPanel } from '@/components/ui/slide-over-panel'
import { EmptyState } from '@/components/ui/state/empty-state'
import { ErrorState } from '@/components/ui/state/error-state'
import { Skeleton } from '@/components/ui/state/skeleton'
import { StatusBadge } from '@/components/ui/status-badge'
import { useAsyncData } from '@/components/ui/use-async-data'
import { formatDateDDMMYYYY } from '@/lib/admin/bookings'
import { toast } from '@/lib/admin/toast'

interface AdminUser {
  id: string
  name: string
  email: string
  role: string | null
  image: string | null
  banned: boolean | null
  createdAt: string
}

// Human labels per role (lowest → highest privilege).
const ROLE_LABEL: Record<AssignableRole, string> = {
  customer: 'Customer',
  staff: 'Staff',
  receptionist: 'Receptionist',
  manager: 'Manager',
  owner: 'Owner',
  developer: 'Developer',
}

/** Toggleable data columns surfaced to the FilterBar column-visibility control. */
const COLUMN_META: { id: string; label: string }[] = [
  { id: 'user', label: 'User' },
  { id: 'email', label: 'Email' },
  { id: 'role', label: 'Role' },
  { id: 'status', label: 'Status' },
  { id: 'joined', label: 'Joined' },
]

function roleLabel(role: string | null): string {
  if (role && role in ROLE_LABEL) {
    return ROLE_LABEL[role as AssignableRole]
  }
  return 'No role'
}

async function fetchUsers(term: string): Promise<AdminUser[]> {
  const qs = term.trim() ? `?search=${encodeURIComponent(term.trim())}` : ''
  const res = await fetch(`/api/users${qs}`)
  const json = await res.json()
  if (!res.ok || !json.success) {
    throw new Error(json?.error?.message ?? 'Could not load users.')
  }
  return json.data.users as AdminUser[]
}

export function UsersManager() {
  const [search, setSearch] = useState('')
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({})
  const [editing, setEditing] = useState<AdminUser | null>(null)

  const fetcher = useCallback(() => fetchUsers(search), [search])
  const { state, retry } = useAsyncData(fetcher)

  // Re-request when the search term changes; the initial mount fetch is owned
  // by the hook, so skip the first effect run to avoid a duplicate request.
  const didMount = useRef(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-fetch only when search changes; retry() reads the latest term through the fetcher closure.
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true
      return
    }
    retry()
  }, [search, retry])

  const columns = useMemo<AdminColumnDef<AdminUser, unknown>[]>(
    () => [
      {
        id: 'user',
        accessorKey: 'name',
        header: 'User',
        cell: ({ row }) => {
          const u = row.original
          return (
            <div className="flex items-center gap-3">
              {u.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={u.image}
                  alt=""
                  className="h-9 w-9 shrink-0 rounded-pill border border-outline-gray object-cover"
                />
              ) : (
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pill bg-cloud-gray font-ui text-sm font-bold text-warm-gray"
                  aria-hidden="true"
                >
                  {(u.name || u.email).trim().charAt(0).toUpperCase()}
                </span>
              )}
              <span className="font-ui font-medium text-cocoa-dark">{u.name || '—'}</span>
            </div>
          )
        },
      },
      {
        id: 'email',
        accessorKey: 'email',
        header: 'Email',
        cell: ({ row }) => <span className="text-warm-gray">{row.original.email}</span>,
      },
      {
        id: 'role',
        accessorKey: 'role',
        header: 'Role',
        enableSorting: false,
        cell: ({ row }) =>
          row.original.role ? (
            <StatusBadge status={row.original.role} />
          ) : (
            <span className="text-dusty-gray">No role</span>
          ),
      },
      {
        id: 'status',
        header: 'Status',
        enableSorting: false,
        cell: ({ row }) => <StatusBadge status={row.original.banned ? 'banned' : 'active'} />,
      },
      {
        id: 'joined',
        accessorKey: 'createdAt',
        header: 'Joined',
        cell: ({ row }) => (
          <span className="text-warm-gray">{formatDateDDMMYYYY(row.original.createdAt)}</span>
        ),
      },
    ],
    [],
  )

  const columnToggles: ColumnToggle[] = COLUMN_META.map((meta) => ({
    id: meta.id,
    label: meta.label,
    visible: columnVisibility[meta.id] !== false,
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl tracking-tight text-cocoa-dark">Users &amp; Roles</h1>
        <p className="mt-0.5 font-sans text-sm text-dusty-gray">
          Assign access levels. A person must sign in on theroyalglow.in once before you can give
          them a role — that first sign-in creates their account.
        </p>
      </div>

      <AssignRoleForm onAssigned={retry} />

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg tracking-tight text-cocoa-dark">Directory</h2>
          <FilterBar
            config={{
              search: {
                placeholder: 'Search name or email…',
                ariaLabel: 'Search users by name or email',
              },
              columnVisibility: true,
            }}
            search={search}
            onSearchChange={setSearch}
            columns={columnToggles}
            onColumnToggle={(id, visible) =>
              setColumnVisibility((current) => ({ ...current, [id]: visible }))
            }
          />
        </div>

        {state.status === 'loading' ? (
          <Skeleton rows={6} variant="table" />
        ) : state.status === 'error' ? (
          <ErrorState message={state.message} onRetry={retry} />
        ) : state.data.length === 0 ? (
          <EmptyState
            icon={Users}
            title={search.trim() ? 'No users match that search' : 'No users yet'}
            message="Accounts appear here after their first sign-in on theroyalglow.in."
          />
        ) : (
          <DataTable
            columns={columns}
            data={state.data}
            tableId="users"
            caption="User directory"
            columnVisibility={columnVisibility}
            onColumnVisibilityChange={setColumnVisibility}
            rowActions={(row) => [
              {
                label: 'Change role',
                icon: KeyRound,
                onSelect: () => setEditing(row.original),
              },
            ]}
          />
        )}
      </section>

      <RoleEditorPanel
        user={editing}
        onClose={() => setEditing(null)}
        onChanged={() => {
          setEditing(null)
          retry()
        }}
      />
    </div>
  )
}

/* ── Assign-role form (email + role) ────────────────────────────────────── */

function AssignRoleForm({ onAssigned }: { onAssigned: () => void }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<AssignableRole>('receptionist')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) {
      setMessage({ kind: 'err', text: 'Enter the email the person signs in with.' })
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), role }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? 'Could not assign the role.')
      }
      const assigned = json.data.user as AdminUser
      const summary = `${assigned.name || assigned.email} is now ${roleLabel(assigned.role)}.`
      setMessage({ kind: 'ok', text: summary })
      toast.success(summary)
      setEmail('')
      onAssigned()
    } catch (err: unknown) {
      const text = err instanceof Error ? err.message : 'Could not assign the role.'
      setMessage({ kind: 'err', text })
      toast.error('Could not assign role', text)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-cards border border-cloud-gray bg-canvas-white p-4"
    >
      <h2 className="font-display text-lg tracking-tight text-cocoa-dark">Assign a role</h2>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <label
            htmlFor="assign-email"
            className="mb-1 block font-ui text-[11px] uppercase tracking-wider text-dusty-gray"
          >
            Email
          </label>
          <Input
            id="assign-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            aria-required="true"
            placeholder="person@gmail.com"
          />
        </div>
        <div className="sm:w-52">
          <label
            htmlFor="assign-role"
            className="mb-1 block font-ui text-[11px] uppercase tracking-wider text-dusty-gray"
          >
            Role
          </label>
          <Select value={role} onValueChange={(v) => setRole(v as AssignableRole)}>
            <SelectTrigger id="assign-role" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectGroup>
                {ASSIGNABLE_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <button
          type="submit"
          disabled={busy}
          className="h-[38px] rounded-buttons bg-cocoa-dark px-5 font-ui text-sm text-canvas-white transition-colors hover:bg-warm-gray disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? 'Assigning…' : 'Assign role'}
        </button>
      </div>

      {message && (
        <p
          className={`font-sans text-sm ${message.kind === 'ok' ? 'text-success' : 'text-error'}`}
          role={message.kind === 'err' ? 'alert' : undefined}
          aria-live="polite"
        >
          {message.text}
        </p>
      )}
    </form>
  )
}

/* ── SlideOverPanel role editor ─────────────────────────────────────────── */

function RoleEditorPanel({
  user,
  onClose,
  onChanged,
}: {
  user: AdminUser | null
  onClose: () => void
  onChanged: () => void
}) {
  const [role, setRole] = useState<AssignableRole>('customer')
  const [busy, setBusy] = useState(false)
  const [rowError, setRowError] = useState<string | null>(null)

  // Seed the editor whenever a user is selected.
  useEffect(() => {
    if (!user) {
      return
    }
    setRole(
      (user.role && (ASSIGNABLE_ROLES as readonly string[]).includes(user.role)
        ? user.role
        : 'customer') as AssignableRole,
    )
    setRowError(null)
  }, [user])

  const save = async () => {
    if (!user) {
      return
    }
    setBusy(true)
    setRowError(null)
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: user.email, role }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? 'Could not update the role.')
      }
      toast.success(`Role updated to ${roleLabel(role)}`)
      onChanged()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not update the role.'
      setRowError(message)
      toast.error('Could not update role', message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <SlideOverPanel
      open={user !== null}
      onOpenChange={(open) => !open && onClose()}
      title="Change role"
      description={user ? user.name || user.email : undefined}
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="h-9 rounded-buttons border border-outline-gray bg-canvas-white px-4 font-ui text-sm text-warm-gray transition-colors hover:bg-cloud-gray disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="h-9 rounded-buttons bg-cocoa-dark px-4 font-ui text-sm text-canvas-white transition-colors hover:bg-warm-gray disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      }
    >
      {user ? (
        <div className="space-y-4">
          <dl className="space-y-2 font-sans text-sm text-cocoa-dark">
            <div className="flex gap-2">
              <dt className="text-dusty-gray">Email</dt>
              <dd className="truncate">{user.email}</dd>
            </div>
            <div className="flex items-center gap-2">
              <dt className="text-dusty-gray">Current</dt>
              <dd>{user.role ? <StatusBadge status={user.role} /> : <span>No role</span>}</dd>
            </div>
          </dl>

          <div className="flex flex-col gap-1">
            <span className="font-ui text-[11px] uppercase tracking-wider text-dusty-gray">
              New role
            </span>
            <Select value={role} onValueChange={(v) => setRole(v as AssignableRole)}>
              <SelectTrigger aria-label={`Role for ${user.email}`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectGroup>
                  {ASSIGNABLE_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          {rowError && (
            <p className="font-sans text-sm text-error" role="alert">
              {rowError}
            </p>
          )}
        </div>
      ) : null}
    </SlideOverPanel>
  )
}

/* ── Shared primitives ──────────────────────────────────────────────────── */
