/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Users Manager
 * Scope        : Admin Portal — User / RBAC administration
 *
 * Description  : Owner-facing screen to assign RBAC roles. An assignment form
 *                (email + role) sits above a searchable directory of every
 *                account, each showing its current role with a quick "Change
 *                role" inline action.
 *
 * Responsibilities :
 * - Assign a role to a user by the email they signed in with
 * - List/search all accounts and surface their current role
 * - Provide inline role changes from any directory row
 * - Surface API guard errors (self-edit, privilege ceiling, unknown email)
 *
 * Features / Functionality :
 * - Assign-role form with role <select> and live validation feedback
 * - Debounced search across name + email
 * - Per-row inline role editor with optimistic reload after success
 * - Accessible status messaging (role="alert" / aria-live)
 *
 * Tech Stack   : Next.js 16, React (Client Component), TypeScript
 * Layer        : Presentation (Management Component)
 *
 * Dependencies : @rgss/types (ASSIGNABLE_ROLES), React hooks
 *
 * Notes        : All mutations go through POST /api/users; the server enforces
 *                the real privilege guards. This UI is a convenience layer.
 ************************************************************/

'use client'

import { ASSIGNABLE_ROLES, type AssignableRole } from '@rgss/types'
import { useCallback, useEffect, useState } from 'react'

interface AdminUser {
  id: string
  name: string
  email: string
  role: string | null
  image: string | null
  banned: boolean | null
  createdAt: string
}

// Human labels + badge styling per role (lowest → highest privilege).
const ROLE_LABEL: Record<AssignableRole, string> = {
  customer: 'Customer',
  staff: 'Staff',
  receptionist: 'Receptionist',
  manager: 'Manager',
  owner: 'Owner',
  developer: 'Developer',
}

const ROLE_BADGE: Record<string, string> = {
  customer: 'bg-cloud-gray text-warm-gray',
  staff: 'bg-sky-100 text-sky-800',
  receptionist: 'bg-teal-100 text-teal-800',
  manager: 'bg-indigo-100 text-indigo-800',
  owner: 'bg-amber-100 text-amber-800',
  developer: 'bg-purple-100 text-purple-800',
}

function roleLabel(role: string | null): string {
  if (role && role in ROLE_LABEL) {
    return ROLE_LABEL[role as AssignableRole]
  }
  return 'No role'
}

export function UsersManager() {
  const [search, setSearch] = useState('')
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (term: string) => {
    setLoading(true)
    setError(null)
    try {
      const qs = term.trim() ? `?search=${encodeURIComponent(term.trim())}` : ''
      const res = await fetch(`/api/users${qs}`)
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? 'Could not load users.')
      }
      setUsers(json.data.users as AdminUser[])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not load users.')
    } finally {
      setLoading(false)
    }
  }, [])

  // Debounce the search so we don't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => load(search), 300)
    return () => clearTimeout(t)
  }, [search, load])

  const refresh = useCallback(() => load(search), [load, search])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-cocoa-dark tracking-tight">Users &amp; Roles</h1>
        <p className="font-sans text-sm text-dusty-gray mt-0.5">
          Assign access levels. A person must sign in on theroyalglow.in once before you can give
          them a role — that first sign-in creates their account.
        </p>
      </div>

      <AssignRoleForm onAssigned={refresh} />

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-lg text-cocoa-dark tracking-tight">Directory</h2>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or email…"
            aria-label="Search users by name or email"
            className="w-64 max-w-[60vw] px-3 py-2 rounded-[6px] border border-outline-gray bg-canvas-white text-sm font-sans text-cocoa-dark focus:outline-none focus:ring-2 focus:ring-deep-gold"
          />
        </div>

        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={refresh} />
        ) : !users || users.length === 0 ? (
          <EmptyState search={search} />
        ) : (
          <ul className="divide-y divide-cloud-gray rounded-[6px] border border-cloud-gray bg-canvas-white">
            {users.map((u) => (
              <li key={u.id}>
                <UserRow user={u} onChanged={refresh} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

// ─── Assign-role form (email + role) ───

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
      setMessage({
        kind: 'ok',
        text: `${assigned.name || assigned.email} is now ${roleLabel(assigned.role)}.`,
      })
      setEmail('')
      onAssigned()
    } catch (err: unknown) {
      setMessage({
        kind: 'err',
        text: err instanceof Error ? err.message : 'Could not assign the role.',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-[6px] border border-cloud-gray bg-canvas-white p-4 space-y-3"
    >
      <h2 className="font-display text-lg text-cocoa-dark tracking-tight">Assign a role</h2>
      <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
        <div className="flex-1 min-w-0">
          <label
            htmlFor="assign-email"
            className="block font-ui text-[11px] uppercase tracking-wider text-dusty-gray mb-1"
          >
            Email
          </label>
          <input
            id="assign-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            aria-required="true"
            placeholder="person@gmail.com"
            className="w-full px-3 py-2 rounded-[6px] border border-outline-gray bg-canvas-white text-sm font-sans text-cocoa-dark focus:outline-none focus:ring-2 focus:ring-deep-gold"
          />
        </div>
        <div className="sm:w-52">
          <label
            htmlFor="assign-role"
            className="block font-ui text-[11px] uppercase tracking-wider text-dusty-gray mb-1"
          >
            Role
          </label>
          <select
            id="assign-role"
            value={role}
            onChange={(e) => setRole(e.target.value as AssignableRole)}
            className="w-full px-3 py-2 rounded-[6px] border border-outline-gray bg-canvas-white text-sm font-sans text-cocoa-dark focus:outline-none focus:ring-2 focus:ring-deep-gold"
          >
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={busy}
          className="h-[38px] px-5 rounded-[6px] bg-cocoa-dark text-canvas-white text-sm font-ui hover:bg-warm-gray transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {busy ? 'Assigning…' : 'Assign role'}
        </button>
      </div>

      {message && (
        <p
          className={`font-sans text-sm ${message.kind === 'ok' ? 'text-emerald-700' : 'text-error'}`}
          role={message.kind === 'err' ? 'alert' : undefined}
          aria-live="polite"
        >
          {message.text}
        </p>
      )}
    </form>
  )
}

// ─── Directory row with inline role editor ───

function UserRow({ user, onChanged }: { user: AdminUser; onChanged: () => void }) {
  const [editing, setEditing] = useState(false)
  const [role, setRole] = useState<AssignableRole>(
    (user.role && (ASSIGNABLE_ROLES as readonly string[]).includes(user.role)
      ? user.role
      : 'customer') as AssignableRole,
  )
  const [busy, setBusy] = useState(false)
  const [rowError, setRowError] = useState<string | null>(null)

  const save = async () => {
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
      setEditing(false)
      onChanged()
    } catch (err: unknown) {
      setRowError(err instanceof Error ? err.message : 'Could not update the role.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="flex items-center gap-3 min-w-0">
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.image}
            alt=""
            className="h-9 w-9 rounded-full object-cover border border-outline-gray shrink-0"
          />
        ) : (
          <span
            className="flex h-9 w-9 items-center justify-center rounded-full bg-cloud-gray font-ui font-bold text-sm text-warm-gray shrink-0"
            aria-hidden="true"
          >
            {(user.name || user.email).trim().charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <p className="font-sans text-[15px] text-cocoa-dark truncate">{user.name || '—'}</p>
          <p className="font-sans text-sm text-warm-gray truncate">{user.email}</p>
          {rowError && (
            <p className="font-sans text-xs text-error mt-0.5" role="alert">
              {rowError}
            </p>
          )}
        </div>
      </div>

      {editing ? (
        <div className="flex items-center gap-2 shrink-0">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as AssignableRole)}
            aria-label={`Role for ${user.email}`}
            className="px-2 py-1.5 rounded-[6px] border border-outline-gray bg-canvas-white text-sm font-sans text-cocoa-dark focus:outline-none focus:ring-2 focus:ring-deep-gold"
          >
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="h-8 px-3 rounded-[6px] bg-cocoa-dark text-canvas-white text-sm font-ui hover:bg-warm-gray transition-colors disabled:opacity-60"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false)
              setRowError(null)
            }}
            disabled={busy}
            className="h-8 px-3 rounded-[6px] border border-outline-gray bg-canvas-white text-sm font-ui text-warm-gray hover:bg-cloud-gray transition-colors disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3 shrink-0">
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-ui uppercase tracking-[0.5px] ${
              ROLE_BADGE[user.role ?? ''] ?? 'bg-cloud-gray text-warm-gray'
            }`}
          >
            {roleLabel(user.role)}
          </span>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-sm font-ui text-deep-gold hover:text-cocoa-dark transition-colors"
          >
            Change role
          </button>
        </div>
      )}
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
      <span className="font-sans text-sm text-dusty-gray">Loading users…</span>
    </output>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
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

function EmptyState({ search }: { search: string }) {
  return (
    <div className="border border-cloud-gray rounded-[6px] bg-canvas-white px-5 py-16 text-center">
      <p className="font-sans text-sm text-cocoa-dark mb-1">
        {search.trim() ? 'No users match that search' : 'No users yet'}
      </p>
      <p className="font-sans text-xs text-dusty-gray">
        Accounts appear here after their first sign-in on theroyalglow.in.
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
