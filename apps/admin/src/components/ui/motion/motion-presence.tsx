/************************************************************
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : ui/motion/motion-presence
 * Scope        : Admin — Route + list presence wrappers
 *
 * Description  : `motion` (motion.dev) presence wrappers for the admin redesign.
 *                `RouteTransition` animates page content on route change using
 *                the bounded `routeTransition` variant; `ListPresence` wraps a
 *                set of animating children in `AnimatePresence` so list/table
 *                rows can enter and exit with the `listRow` variant. Both render
 *                their children directly (final visual state, no animation) when
 *                the user prefers reduced motion (Req 3.7, 4.6).
 *
 * Responsibilities :
 * - `RouteTransition` — keyed enter/exit of page content ≤300ms (Req 3.x)
 * - `ListPresence` — `AnimatePresence` host for row enter/exit (Req 3.x)
 * - Short-circuit to the final visual state under reduced motion (Req 3.7, 4.6)
 *
 * Tech Stack   : React (Client Component), motion (motion.dev), TypeScript
 * Layer        : Presentation (motion wrappers, no I/O, no business logic)
 *
 * Dependencies : motion/react (AnimatePresence, motion), ./motion-variants,
 *                ./use-reduced-motion
 ************************************************************/

'use client'

import { AnimatePresence, motion } from 'motion/react'
import type { ReactNode } from 'react'
import { routeTransition } from './motion-variants'
import { usePrefersReducedMotion } from './use-reduced-motion'

/**
 * Animate page content on route change. Pass a stable `routeKey` (typically the
 * pathname) so the content re-enters when the route changes. Under reduced
 * motion the children render directly with no animation.
 *
 * NOTE: This intentionally does NOT use `AnimatePresence`. With the Next.js App
 * Router, `AnimatePresence mode="wait"` keeps the EXITING route's DOM mounted
 * while the router has already swapped the tree, which desyncs React's hook
 * sequence ("Rendered more hooks…") and makes motion call `removeChild` on a
 * node the router already removed ("Cannot read properties of null (reading
 * 'removeChild')"). A keyed `motion.div` remounts on navigation and plays the
 * entrance variant only — no exit retention, so neither error can occur.
 */
export function RouteTransition({
  routeKey,
  children,
}: {
  /** Stable key (usually the pathname) that triggers the transition on change. */
  routeKey: string
  children: ReactNode
}) {
  const reduced = usePrefersReducedMotion()

  if (reduced) {
    return <>{children}</>
  }

  return (
    <motion.div key={routeKey} variants={routeTransition} initial="hidden" animate="visible">
      {children}
    </motion.div>
  )
}

/**
 * `AnimatePresence` host for a set of animating children (e.g. table/list rows
 * that use the `listRow` variant). Under reduced motion the children render
 * directly with no enter/exit animation.
 */
export function ListPresence({ children }: { children: ReactNode }) {
  const reduced = usePrefersReducedMotion()

  if (reduced) {
    return <>{children}</>
  }

  return <AnimatePresence initial={false}>{children}</AnimatePresence>
}
