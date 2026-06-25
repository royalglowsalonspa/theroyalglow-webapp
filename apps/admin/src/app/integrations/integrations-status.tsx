'use client'

import { useCallback, useEffect, useState } from 'react'

interface Integration {
  name: string
  configured: boolean
  status: 'ok' | 'degraded' | 'unconfigured' | 'error'
  detail?: string
}

const DOT: Record<string, string> = {
  ok: 'bg-emerald-500',
  degraded: 'bg-amber-500',
  unconfigured: 'bg-cloud-gray',
  error: 'bg-red-500',
}

export function IntegrationsStatus() {
  const [items, setItems] = useState<Integration[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/integrations')
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json?.error?.message ?? 'Failed.')
      setItems(json.data.integrations as Integration[])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display text-cocoa-dark tracking-tight">Integrations</h1>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="h-9 px-4 rounded-[6px] border border-outline-gray bg-canvas-white text-sm font-ui text-cocoa-dark hover:bg-cloud-gray transition-colors disabled:opacity-40"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-dusty-gray text-center py-16">Checking…</p>
      ) : error ? (
        <p className="text-sm text-error text-center py-10" role="alert">
          {error}
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((i) => (
            <li key={i.name} className="rounded-[6px] border border-cloud-gray bg-canvas-white p-4">
              <div className="flex items-center gap-3">
                <span
                  className={`h-3 w-3 rounded-full shrink-0 ${DOT[i.status]}`}
                  aria-hidden="true"
                />
                <p className="font-sans text-[15px] text-cocoa-dark">{i.name}</p>
              </div>
              <p className="mt-2 font-sans text-sm text-warm-gray">{i.detail ?? i.status}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
