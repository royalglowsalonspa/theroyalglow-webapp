/************************************************************
 * Project      : theroyalglow-webapp (apps/web)
 * Module Name  : ui/motion/motion-variants
 * Scope        : Web — Motion design tokens (bounded variants)
 *
 * Description  : Named, bounded `motion` (motion.dev) animation variants shared
 *                across the customer-site redesign. Durations are centralised in
 *                `DURATION` so no component hard-codes timing. Entrance variants
 *                are reduced-motion safe via the wrappers in
 *                `motion-presence.tsx`.
 *
 * Responsibilities :
 * - Expose section entrance variants (`fadeInUp`, `fadeIn`) and a staggered
 *   container/item pair for lists and card grids
 * - Expose the `DURATION` scale
 *
 * Tech Stack   : TypeScript, motion (motion.dev)
 * Layer        : Presentation (motion tokens, no I/O, no business logic)
 *
 * Dependencies : motion/react (Variants, Transition types)
 ************************************************************/

import type { Transition, Variants } from 'motion/react'

/** Centralised motion durations (seconds). */
export const DURATION = {
  /** Micro-interaction (hover, tap, indicator). */
  micro: 0.15,
  /** Short transition (exits, small reveals). */
  short: 0.2,
  /** Base transition (overlays, route enter). */
  base: 0.3,
  /** Section entrance / emphasis reveal. */
  enter: 0.6,
} as const

/** Shared ease-out curve. */
const EASE_OUT: Transition['ease'] = [0.16, 1, 0.3, 1]

/** Fade + rise. The workhorse section/element entrance. */
export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: DURATION.enter, ease: EASE_OUT } },
}

/** Plain fade entrance. */
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: DURATION.base, ease: EASE_OUT } },
}

/** Stagger container — children reveal in sequence. */
export const staggerContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.04 } },
}

/** Stagger child — pair with `staggerContainer`. */
export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: DURATION.base, ease: EASE_OUT } },
}
