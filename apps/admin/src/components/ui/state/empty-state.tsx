/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : state/empty-state
 * Scope        : Admin — State Presenters / Empty State
 *
 * Description  : Empty-state presenter for the admin design system. Shown when
 *                a data view has loaded successfully but contains no records.
 *                Renders an optional decorative icon, a title, and a message
 *                describing the absence of records for that view.
 *
 * Responsibilities :
 * - Render a message describing the absence of records (Req 12.2)
 * - Optionally render a decorative lucide icon above the message
 *
 * Features / Functionality :
 * - EmptyState — title + message + optional icon presenter
 *
 * Tech Stack   : React, TypeScript, lucide-react, Tailwind CSS v4 (Brand Tokens)
 * Layer        : Presentation (primitive, no I/O, no business logic)
 *
 * Dependencies : ../icon, @rgss/ui/lib/utils
 *
 * Notes        : Uses ONLY semantic Brand-Token utilities — no hex / raw
 *                colour literals (Req 1.2). The icon is decorative; the title
 *                and message carry the accessible content.
 ************************************************************/

import { cn } from '@rgss/ui/lib/utils'
import type { LucideIcon } from 'lucide-react'
import { Icon } from '../icon'

type EmptyStateProps = {
  /** Short heading naming what is absent (e.g. "No bookings yet"). */
  title: string
  /** Sentence describing the absence of records for this view (Req 12.2). */
  message: string
  /** Optional decorative lucide icon rendered above the title. */
  icon?: LucideIcon
  className?: string
}

/**
 * Empty-state presenter.
 *
 * Rendered when a view loads with no records. The optional icon is decorative
 * (hidden from assistive technology); the title and message are the accessible
 * content describing the absence of records (Req 12.2).
 *
 * Presentation-only: no I/O, no business logic.
 *
 * @param props - {@link EmptyStateProps}
 * @returns The rendered empty state.
 */
export function EmptyState({ title, message, icon, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-[6px] border border-cloud-gray px-6 py-12 text-center',
        className,
      )}
    >
      {icon ? <Icon className="text-dusty-gray" decorative icon={icon} size={32} /> : null}
      <p className="font-ui text-base font-medium text-cocoa-dark">{title}</p>
      <p className="max-w-prose font-sans text-sm text-warm-gray">{message}</p>
    </div>
  )
}
