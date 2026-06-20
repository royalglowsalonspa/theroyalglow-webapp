/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 08-06-2026 & Updated - 08-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : ui/lib/utils
 * Scope        : Shared UI Utility
 *
 * Description  : General-purpose utility functions shared across all
 *                shadcn/ui primitives in the @rgss/ui package. Provides
 *                class name merging with Tailwind CSS conflict resolution.
 *
 * Responsibilities :
 * - Merge class names using clsx and tailwind-merge
 * - Resolve Tailwind CSS class conflicts automatically
 *
 * Features / Functionality :
 * - cn() helper for conditional and merged class names
 *
 * Tech Stack   : TypeScript, clsx, tailwind-merge
 * Layer        : Shared Package (UI)
 *
 * Dependencies : clsx, tailwind-merge
 *
 * Notes        : Single source of truth for the cn() helper. Both apps/web
 *                and apps/admin consume this via `@rgss/ui/lib/utils`.
 ************************************************************/

import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
