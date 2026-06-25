'use client'

import { formatDateDDMMYYYY } from '@/lib/admin/bookings'
import { AUDIT_ACTIONS } from '@rgss/types'
import { useCallback, useEffect, useState } from 'react'

interface LogEntry {
  id: string
  actorName: string
  actorEmail: string
  action: string
  entityType: string
  entityId: string
  ipAddress: string | null
  createdAt: string
}

const ACTION_BADGE: Record<string, string> = {
  create: 'bg-emerald-100 text-emerald-700',
  update: 'bg-blue-100 text-blue-700',
  delete: 'bg-red-100 text-red-700',
  status_change: 'bg-amber-100 text-amber-800',
}

const PAGE_SIZE = 30

export function LogsTable() {
  const [rows, setRows] = useState<LogEntry[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [action, setAction] = useState('')
  const [entity, setEntity] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (action) params.set('action', action)
      if (entity.trim()) params.set('entity', entity.trim())
      params.set('page', String(page))
      params.set('pageSize', String(PAGE_SIZE))
      const res = await fetch(`/api/logs?${params}`)
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json?.error?.message ?? 'Failed to load logs.')
      setRows(json.data.logs as LogEntry[])
      setTotalPages(json.meta?.totalPages ?? 1)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load logs.')
    } finally {
      setLoading(false)
    }
  }, [action, entity, page])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-display text-cocoa-dark tracking-tight">Audit Logs</h1>

      <div className="flex flex-wrap items-end gap-3 p-3 border border-cloud-gray rounded-[6px] bg-cloud-gray/30">
        <div className="flex flex-col gap-1">
          <label
            htmlFor="log-action"
            className="text-[10px] font-ui uppercase tracking-wider text-dusty-gray"
          >
            Action
          </label>
          <select
            id="log-action"
            value={action}
            onChange={(e) => {
              setAction(e.target.value)
              setPage(1)
            }}
            className="h-9 px-3 rounded-[6px] border border-outline-gray bg-canvas-white text-sm font-sans text-cocoa-dark focus:outline-none focus:ring-2 focus:ring-deep-gold"
          >
            <option value="">All</option>
            {AUDIT_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
          <label
            htmlFor="log-entity"
            className="text-[10px] font-ui uppercase tracking-wider text-dusty-gray"
          >
            Entity type
          </label>
          <input
            id="log-entity"
            type="search"
            value={entity}
            onChange={(e) => {
              setEntity(e.target.value)
              setPage(1)
            }}
            placeholder="e.g. booking, user"
            className="h-9 px-3 rounded-[6px] border border-outline-gray bg-canvas-white text-sm font-sans text-cocoa-dark focus:outline-none focus:ring-2 focus:ring-deep-gold"
          />
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-dusty-gray text-center py-16">Loading…</p>
      ) : error ? (
        <p className="text-sm text-error text-center py-10" role="alert">
          {error}
        </p>
      ) : !rows || rows.length === 0 ? (
        <p className="text-sm text-dusty-gray text-center py-16">No audit entries match.</p>
      ) : (
        <>
          <div className="border border-cloud-gray rounded-[6px] overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-cloud-gray/60">
                  <Th>Time</Th>
                  <Th>Actor</Th>
                  <Th>Action</Th>
                  <Th>Entity</Th>
                  <Th>IP</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cloud-gray">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-cloud-gray/30 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap font-sans text-warm-gray">
                      {formatDateDDMMYYYY(r.createdAt)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-sans text-cocoa-dark">
                      {r.actorName}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-ui uppercase tracking-[0.5px] ${ACTION_BADGE[r.action] ?? 'bg-cloud-gray text-warm-gray'}`}
                      >
                        {r.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-sans text-warm-gray">
                      {r.entityType} ·{' '}
                      <span className="text-cocoa-dark">{r.entityId.slice(0, 8)}…</span>
                    </td>
                    <td className="px-4 py-3 font-sans text-dusty-gray">{r.ipAddress ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="h-9 px-3 rounded-[6px] border border-outline-gray bg-canvas-white text-sm font-ui disabled:opacity-40"
            >
              ← Prev
            </button>
            <span className="text-sm text-warm-gray">
              Page {page} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="h-9 px-3 rounded-[6px] border border-outline-gray bg-canvas-white text-sm font-ui disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-left px-4 py-2.5 font-ui text-xs uppercase tracking-wider text-dusty-gray">
      {children}
    </th>
  )
}
