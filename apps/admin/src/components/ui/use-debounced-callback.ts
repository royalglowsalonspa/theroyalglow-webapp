'use client'

/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : use-debounced-callback
 * Scope        : Admin — Reusable Primitives / FilterBar search
 *
 * Description  : Client React hook that returns a debounced wrapper around a
 *                callback. Used by the FilterBar search input to emit a trimmed
 *                search term only after the user pauses typing (300 ms), rather
 *                than on every keystroke.
 *
 * Responsibilities :
 * - Defer invocation of a callback until a configurable quiet period elapses
 * - Reset the pending timer on each re-call so only the last call fires
 * - Clean up the pending timer on unmount and before each re-schedule
 *
 * Features / Functionality :
 * - DEFAULT_DEBOUNCE_MS constant (300)
 * - useDebouncedCallback(callback, delayMs?) — returns a stable debounced fn
 *
 * Tech Stack   : TypeScript, React 19
 * Layer        : Presentation (UI hook, no I/O, no business logic)
 *
 ************************************************************/

import { useCallback, useEffect, useRef } from 'react'

/**
 * Default debounce delay (milliseconds) used when no delay is supplied.
 * Matches the FilterBar search debounce specified by the design.
 */
export const DEFAULT_DEBOUNCE_MS = 300

/**
 * Any function the caller wants to debounce.
 */
type Callback<Args extends unknown[]> = (...args: Args) => void

/**
 * Return a debounced version of `callback` that delays invocation until
 * `delayMs` has elapsed since the last time the debounced function was called.
 *
 * Each invocation clears the previously scheduled timer, so only the final call
 * within a burst actually runs (with that call's arguments). The pending timer
 * is cleared automatically on unmount.
 *
 * The latest `callback` is always invoked via a ref, so callers may pass an
 * inline closure without re-arming the timer or invalidating the returned
 * function's identity.
 *
 * Presentation-only: no I/O, no business logic.
 *
 * @param callback - The function to invoke after the quiet period.
 * @param delayMs - Quiet period in milliseconds (defaults to {@link DEFAULT_DEBOUNCE_MS}).
 * @returns A stable debounced function with the same argument signature.
 */
export function useDebouncedCallback<Args extends unknown[]>(
  callback: Callback<Args>,
  delayMs: number = DEFAULT_DEBOUNCE_MS
): Callback<Args> {
  const callbackRef = useRef(callback)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep the ref pointing at the most recent callback without re-creating the
  // debounced function returned below.
  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  // Clear any pending timer when the component using the hook unmounts.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [])

  return useCallback(
    (...args: Args) => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
      }
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        callbackRef.current(...args)
      }, delayMs)
    },
    [delayMs]
  )
}
