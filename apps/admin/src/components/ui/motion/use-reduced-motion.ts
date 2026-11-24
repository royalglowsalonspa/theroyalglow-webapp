/************************************************************
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : ui/motion/use-reduced-motion
 * Scope        : Admin — Reduced-motion preference hook
 *
 * Description  : Tracks the browser's reduced-motion setting while using the
 *                same snapshot during server rendering and hydration.
 *
 * Tech Stack   : React, MediaQueryList
 ************************************************************/

'use client'

import { useSyncExternalStore } from 'react'

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

function subscribe(onChange: () => void) {
  const query = window.matchMedia?.(REDUCED_MOTION_QUERY)
  query?.addEventListener('change', onChange)
  return () => query?.removeEventListener('change', onChange)
}

function getPreference() {
  return window.matchMedia?.(REDUCED_MOTION_QUERY).matches ?? false
}

function getServerPreference() {
  return false
}

/**
 * @returns `true` when the user has requested reduced motion, else `false`.
 * Resolves to `false` while the preference is still unknown.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getPreference, getServerPreference)
}
