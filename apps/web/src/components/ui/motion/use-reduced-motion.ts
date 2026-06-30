/************************************************************
 * Project      : theroyalglow-webapp (apps/web)
 * Module Name  : ui/motion/use-reduced-motion
 * Scope        : Web — Reduced-motion preference hook
 *
 * Description  : Thin wrapper over motion's `useReducedMotion` that returns a
 *                strict boolean (defaulting to `false` before hydration / when
 *                the preference is unknown). Consumed by the motion presence
 *                wrappers and any component that must render the final visual
 *                state instead of animating when the user prefers reduced
 *                motion.
 *
 * Tech Stack   : React, motion (motion.dev)
 * Layer        : Presentation (hook, no I/O, no business logic)
 *
 * Dependencies : motion/react (useReducedMotion)
 ************************************************************/

'use client'

import { useReducedMotion } from 'motion/react'

/**
 * @returns `true` when the user has requested reduced motion, else `false`.
 * Resolves to `false` while the preference is still unknown.
 */
export function usePrefersReducedMotion(): boolean {
  return useReducedMotion() ?? false
}
