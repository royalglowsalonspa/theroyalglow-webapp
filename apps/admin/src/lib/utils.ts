/************************************************************
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : lib/utils
 * Scope        : Admin — shadcn class-name utility
 *
 * Description  : Canonical `cn` class-name merge helper imported by the
 *                owned-source shadcn/ui components (they import from
 *                `@/lib/utils`). Combines `clsx` conditional classes with
 *                `tailwind-merge` conflict resolution. Mirrors the shared
 *                `@rgss/ui/lib/utils` helper so both import styles produce
 *                identical output.
 *
 * Tech Stack   : TypeScript, clsx, tailwind-merge
 * Layer        : Presentation (utility, no I/O, no business logic)
 *
 * Dependencies : clsx, tailwind-merge
 ************************************************************/

import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Merge conditional class names, resolving Tailwind class conflicts. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
