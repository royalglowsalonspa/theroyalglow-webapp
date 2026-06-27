/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : use-async-data
 * Scope        : Admin — reusable async-data fetch + timeout hook
 *
 * Description  : Client hook that orchestrates a single fetcher call and tracks
 *                its loading / success / error lifecycle with a configurable
 *                timeout deadline. The fetch settles to 'success' iff it
 *                resolves strictly before the timeout deadline, otherwise it
 *                settles to 'error' with a retry available. retry() transitions
 *                error -> loading and re-requests.
 *
 * Responsibilities :
 * - Run the supplied fetcher on mount
 * - Settle to 'success' when the fetcher resolves before the deadline
 * - Settle to 'error' on rejection, thrown error, or timeout
 * - Expose retry() that transitions error -> loading and re-requests
 * - Clean up the timeout timer and ignore stale settlements on unmount/retry
 *
 * Features / Functionality :
 * - AdminAsyncState<T> discriminated union (loading | success | error)
 * - asyncDataReducer — pure, factorable state-transition helper (Property 15)
 * - useAsyncData<T>(fetcher, opts) — fetch + timing orchestration
 * - DEFAULT_ASYNC_TIMEOUT_MS (30s) / DASHBOARD_ASYNC_TIMEOUT_MS (10s)
 *
 * Tech Stack   : TypeScript, React (Next.js 16 App Router)
 * Layer        : Presentation (fetch orchestration + timing only)
 *
 * Notes        : NO business logic and NO API-contract decisions live here —
 *                this hook only orchestrates the fetcher it is given and the
 *                timing around it. The pure asyncDataReducer is exported so the
 *                deterministic timeout outcome (Property 15) can be tested
 *                without timers. Confined to apps/admin/src/components/ui/.
 *                (Req 10.8, 12.4, 12.5, 12.6)
 ************************************************************/
'use client'

import { useCallback, useEffect, useReducer, useRef } from 'react'

/**
 * The async-data lifecycle as a discriminated union: a request is always
 * `loading` first, then settles to exactly one terminal state — `success`
 * (carrying the resolved data) or `error` (carrying a human-readable message).
 */
export type AdminAsyncState<T> =
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; message: string }

/** Default timeout deadline for general admin data requests (30 seconds). */
export const DEFAULT_ASYNC_TIMEOUT_MS = 30_000

/** Tighter timeout deadline used by the dashboard overview (10 seconds). */
export const DASHBOARD_ASYNC_TIMEOUT_MS = 10_000

/** Message shown when a request exceeds its timeout deadline (Req 12.6). */
export const ASYNC_TIMEOUT_MESSAGE = 'The request timed out. Please try again.'

/** Generic fallback message for a rejection without a usable message (Req 12.3). */
export const ASYNC_ERROR_MESSAGE = 'Something went wrong. Please try again.'

/**
 * Pure state-transition actions for {@link asyncDataReducer}.
 *
 * `request` starts (or, via retry, restarts) a fetch; `resolve` carries
 * successful data; `reject` carries an error/timeout message.
 */
export type AsyncAction<T> =
  | { type: 'request' }
  | { type: 'resolve'; data: T }
  | { type: 'reject'; message: string }

/** The initial state for every request: `loading` (Req 12.5). */
export function initialAsyncState<T>(): AdminAsyncState<T> {
  return { status: 'loading' }
}

/**
 * Pure state-transition helper for the async-data lifecycle.
 *
 * Factored out of the hook so the deterministic timeout outcome can be modelled
 * and tested without real timers (Property 15). The reducer settles to a
 * terminal state only while `loading`, so the first of resolve/reject (a
 * timeout is modelled as a `reject`) to arrive wins and any later settlement is
 * ignored. This yields: a request settles to `success` iff it resolves strictly
 * before the timeout deadline, otherwise `error` (Req 12.6, 10.8). `request`
 * always (re)enters `loading`, modelling retry's error -> loading transition
 * (Req 12.4, 12.5).
 *
 * Pure function: no I/O, no side effects, no business logic.
 */
export function asyncDataReducer<T>(
  state: AdminAsyncState<T>,
  action: AsyncAction<T>,
): AdminAsyncState<T> {
  switch (action.type) {
    case 'request':
      return state.status === 'loading' ? state : { status: 'loading' }
    case 'resolve':
      return state.status === 'loading' ? { status: 'success', data: action.data } : state
    case 'reject':
      return state.status === 'loading' ? { status: 'error', message: action.message } : state
    default:
      return state
  }
}

/**
 * Orchestrate a single async fetch with a configurable timeout deadline.
 *
 * Runs `fetcher` on mount and exposes the current {@link AdminAsyncState} plus a
 * `retry` callback. The request settles to `success` when the fetcher resolves
 * before the deadline, and to `error` on rejection, thrown error, or timeout —
 * with `retry()` transitioning `error -> loading` and re-issuing the request.
 * The timeout timer is cleared and stale settlements are ignored on unmount or
 * when a newer request supersedes an in-flight one.
 *
 * Fetch orchestration and timing only — no business logic, no API-contract
 * decisions (Req 10.8, 12.4, 12.5, 12.6).
 *
 * @param fetcher Caller-supplied async producer of the data.
 * @param opts.timeoutMs Deadline in ms; defaults to {@link DEFAULT_ASYNC_TIMEOUT_MS}.
 */
export function useAsyncData<T>(
  fetcher: () => Promise<T>,
  opts: { timeoutMs?: number } = {},
): { state: AdminAsyncState<T>; retry: () => void } {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_ASYNC_TIMEOUT_MS

  const [state, dispatch] = useReducer(asyncDataReducer<T>, undefined, initialAsyncState<T>)

  // Keep the latest fetcher without forcing a re-run when its identity changes.
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestIdRef = useRef(0)
  const mountedRef = useRef(true)

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const run = useCallback(() => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    // Enter (or re-enter, for retry) the loading state and arm the deadline.
    dispatch({ type: 'request' })
    clearTimer()

    timerRef.current = setTimeout(() => {
      if (!mountedRef.current || requestId !== requestIdRef.current) {
        return
      }
      timerRef.current = null
      dispatch({ type: 'reject', message: ASYNC_TIMEOUT_MESSAGE })
    }, timeoutMs)

    const isStale = () => !mountedRef.current || requestId !== requestIdRef.current

    fetcherRef.current().then(
      (data) => {
        if (isStale()) {
          return
        }
        clearTimer()
        dispatch({ type: 'resolve', data })
      },
      (error: unknown) => {
        if (isStale()) {
          return
        }
        clearTimer()
        const message =
          error instanceof Error && error.message ? error.message : ASYNC_ERROR_MESSAGE
        dispatch({ type: 'reject', message })
      },
    )
  }, [clearTimer, timeoutMs])

  const retry = useCallback(() => {
    run()
  }, [run])

  useEffect(() => {
    mountedRef.current = true
    run()
    return () => {
      mountedRef.current = false
      clearTimer()
    }
  }, [run, clearTimer])

  return { state, retry }
}
