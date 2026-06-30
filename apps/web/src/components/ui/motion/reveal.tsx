/************************************************************
 * Project      : theroyalglow-webapp (apps/web)
 * Module Name  : ui/motion/reveal
 * Scope        : Web — Scroll-into-view reveal wrappers
 *
 * Description  : `motion` (motion.dev) wrappers for the customer-site redesign.
 *                `Reveal` animates a block on first scroll into view using a
 *                bounded entrance variant; `RevealGroup` + `RevealItem` stagger
 *                a set of children (card grids, lists). All short-circuit to
 *                the final visual state (no animation) when the user prefers
 *                reduced motion.
 *
 * Responsibilities :
 * - `Reveal` — single-element fade/rise on viewport entry (once)
 * - `RevealGroup` / `RevealItem` — staggered children on viewport entry
 * - Render the final state directly under reduced motion
 *
 * Tech Stack   : React (Client Component), motion (motion.dev), TypeScript
 * Layer        : Presentation (motion wrappers, no I/O, no business logic)
 *
 * Dependencies : motion/react, ./motion-variants, ./use-reduced-motion
 *
 * Notes        : Polymorphic via a STATIC tag map (`motion.div`/`motion.section`
 *                /`motion.ul`/`motion.li`). Dynamic `motion(tag)` / per-render
 *                `motion.create()` are intentionally avoided.
 ************************************************************/

'use client'

import { type HTMLMotionProps, motion } from 'motion/react'
import type { ReactNode } from 'react'
import { fadeInUp, staggerContainer, staggerItem } from './motion-variants'
import { usePrefersReducedMotion } from './use-reduced-motion'

type RevealTag = 'div' | 'section' | 'ul' | 'li'

const MOTION_TAG = {
  div: motion.div,
  section: motion.section,
  ul: motion.ul,
  li: motion.li,
} as const

type RevealProps = {
  children: ReactNode
  className?: string
  /** Semantic element to render. Defaults to 'div'. */
  as?: RevealTag
  /** Fraction of the element visible before it animates in. */
  amount?: number
} & Omit<HTMLMotionProps<'div'>, 'variants' | 'initial' | 'whileInView' | 'children'>

/** Fade + rise a block the first time it scrolls into view. */
export function Reveal({ children, className, as = 'div', amount = 0.2, ...props }: RevealProps) {
  const reduced = usePrefersReducedMotion()
  // All mapped tags accept the same subset of motion props we pass; cast to a
  // single concrete signature so the spread props type-check across tags.
  const Motion = MOTION_TAG[as] as typeof motion.div

  if (reduced) {
    const Tag = as
    return <Tag className={className}>{children}</Tag>
  }

  return (
    <Motion
      className={className}
      variants={fadeInUp}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount }}
      {...props}
    >
      {children}
    </Motion>
  )
}

/** Stagger container — reveals `RevealItem` children in sequence on entry. */
export function RevealGroup({ children, className, as = 'div', amount = 0.15 }: RevealProps) {
  const reduced = usePrefersReducedMotion()
  const Motion = MOTION_TAG[as] as typeof motion.div

  if (reduced) {
    const Tag = as
    return <Tag className={className}>{children}</Tag>
  }

  return (
    <Motion
      className={className}
      variants={staggerContainer}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount }}
    >
      {children}
    </Motion>
  )
}

/** Stagger child — must be rendered inside a `RevealGroup`. */
export function RevealItem({ children, className, as = 'div' }: RevealProps) {
  const reduced = usePrefersReducedMotion()
  const Motion = MOTION_TAG[as] as typeof motion.div

  if (reduced) {
    const Tag = as
    return <Tag className={className}>{children}</Tag>
  }

  return (
    <Motion className={className} variants={staggerItem}>
      {children}
    </Motion>
  )
}
