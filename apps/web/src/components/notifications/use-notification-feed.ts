import { useCallback, useEffect, useRef, useState } from 'react'
import { z } from 'zod'

const feedSchema = z.object({
  success: z.literal(true),
  data: z.object({
    notifications: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        body: z.string(),
        readAt: z.string().nullable(),
        createdAt: z.string(),
      }),
    ),
    unreadCount: z.number().int().nonnegative(),
  }),
})

type Snapshot = z.infer<typeof feedSchema>['data']
type Feed =
  | { status: 'loading' | 'unauthorized'; snapshot: null }
  | { status: 'ready'; snapshot: Snapshot }
  | { status: 'error'; snapshot: Snapshot | null }

export function useNotificationFeed(pollIntervalMs?: number) {
  const [feed, setFeed] = useState<Feed>({ status: 'loading', snapshot: null })
  const [markStatus, setMarkStatus] = useState<'ready' | 'marking' | 'error'>('ready')
  const activeRead = useRef<AbortController | null>(null)
  const activeWrite = useRef<AbortController | null>(null)

  const refresh = useCallback(async () => {
    if (activeWrite.current) return
    activeRead.current?.abort()
    const request = new AbortController()
    activeRead.current = request
    setFeed((current) => (current.snapshot ? current : { status: 'loading', snapshot: null }))
    try {
      const response = await fetch('/api/notifications', {
        headers: { accept: 'application/json' },
        signal: request.signal,
      })
      if (request.signal.aborted) return
      if (response.status === 401) {
        setFeed({ status: 'unauthorized', snapshot: null })
        setMarkStatus('ready')
        return
      }
      if (!response.ok) throw new Error('Could not load notifications')
      const json = feedSchema.parse(await response.json())
      if (!request.signal.aborted) setFeed({ status: 'ready', snapshot: json.data })
    } catch {
      if (!request.signal.aborted) {
        setFeed((current) => ({ status: 'error', snapshot: current.snapshot }))
      }
    } finally {
      if (activeRead.current === request) activeRead.current = null
    }
  }, [])

  useEffect(() => {
    void refresh()
    const timer = pollIntervalMs === undefined ? undefined : setInterval(refresh, pollIntervalMs)
    return () => {
      if (timer !== undefined) clearInterval(timer)
      activeRead.current?.abort()
      activeWrite.current?.abort()
      activeWrite.current = null
    }
  }, [pollIntervalMs, refresh])

  const markAllRead = useCallback(async () => {
    if (activeWrite.current) return
    activeRead.current?.abort()
    const request = new AbortController()
    activeWrite.current = request
    setMarkStatus('marking')
    try {
      const response = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
        signal: request.signal,
      })
      if (request.signal.aborted) return
      if (response.status === 401) {
        setFeed({ status: 'unauthorized', snapshot: null })
        setMarkStatus('ready')
        return
      }
      if (!response.ok) throw new Error('Could not mark notifications read')

      const readAt = new Date().toISOString()
      setFeed((current) => {
        if (!current.snapshot) return current
        return {
          status: 'ready',
          snapshot: {
            notifications: current.snapshot.notifications.map((notification) => ({
              ...notification,
              readAt: notification.readAt ?? readAt,
            })),
            unreadCount: 0,
          },
        }
      })
      setMarkStatus('ready')
    } catch {
      if (!request.signal.aborted) setMarkStatus('error')
      return
    } finally {
      if (activeWrite.current === request) activeWrite.current = null
    }
    // Read back any notifications that arrived during the mutation.
    void refresh()
  }, [refresh])

  return { feed, refresh, markAllRead, markStatus }
}
