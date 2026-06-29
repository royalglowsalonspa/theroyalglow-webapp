/************************************************************
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : ui/motion/motion-variants
 * Scope        : Admin — Motion design tokens (bounded variants)
 *
 * Description  : Named, bounded `motion` (motion.dev) animation variants shared
 *                across the admin redesign. Every transition duration is capped
 *                so overlays, route changes, and list rows complete within
 *                300ms (Req 3.x); the single emphasis variant runs 200–600ms
 *                and animates at least two properties (Req 4.x). Durations are
 *                centralised in `DURATION` so no component hard-codes timing.
 *
 * Responsibilities :
 * - Expose `overlaySlideRight`, `overlayFade`, `routeTransition`, `listRow`
 *   (all ≤300ms) and `emphasisPop` (200–600ms, ≥2 animated properties)
 * - Expose the `DURATION` scale (`micro` 0.15s, `short`, `base` 0.3s)
 *
 * Tech Stack   : TypeScript, motion (motion.dev)
 * Layer        : Presentation (motion tokens, no I/O, no business logic)
 *
 * Dependencies : motion/react (Variants, Transition types)
 *
 * Notes        : Reduced-motion is NOT handled here — the presence wrappers in
 *                `motion-presence.tsx` short-circuit to the final visual state
 *                when `usePrefersReducedMotion()` is true (Req 3.7, 4.6).
 ************************************************************/

import type { Transition, Variants } from 'motion/react'

/** Centralised motion durations (seconds). All overlay/route/list ≤ base. */
export const DURATION = {
  /** Micro-interaction (hover, tap, indicator). */
  micro: 0.15,
  /** Short transition (exits, small reveals). */
  short: 0.2,
  /** Base transition cap for overlays / route / list enter (300ms). */
  base: 0.3,
} as const

/** Shared ease-out curve. */
const EASE_OUT: Transition['ease'] = [0.16, 1, 0.3, 1]

/** Right-edge overlay slide (Sheet / detail panel). ≤300ms. */
export const overlaySlideRight: Variants = {
  hidden: { x: '100%' },
  visible: { x: 0, transition: { duration: DURATION.base, ease: EASE_OUT } },
  exit: { x: '100%', transition: { duration: DURATION.base, ease: EASE_OUT } },
}

/** Backdrop / dialog fade. ≤300ms. */
export const overlayFade: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: DURATION.base, ease: EASE_OUT } },
  exit: { opacity: 0, transition: { duration: DURATION.short, ease: EASE_OUT } },
}

/** Route / page content transition. ≤300ms. */
export const routeTransition: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: DURATION.base, ease: EASE_OUT } },
  exit: { opacity: 0, y: 8, transition: { duration: DURATION.short, ease: EASE_OUT } },
}

/** Table / list row enter+exit. ≤300ms. */
export const listRow: Variants = {
  hidden: { opacity: 0, y: 4 },
  visible: { opacity: 1, y: 0, transition: { duration: DURATION.short, ease: EASE_OUT } },
  exit: { opacity: 0, transition: { duration: DURATION.micro, ease: EASE_OUT } },
}

/**
 * Emphasis reveal for success / state-change moments (e.g. empty→error
 * presenter swap). Runs 400ms (within the 200–600ms band) and animates two
 * properties — `opacity` and `scale` — per Req 4.x.
 */
export const emphasisPop: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.4, ease: EASE_OUT } },
}
