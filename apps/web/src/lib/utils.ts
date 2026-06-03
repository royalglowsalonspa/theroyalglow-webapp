/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : utils
 * Scope        : Utility
 *
 * Description  : General-purpose utility functions for the web app.
 *                Provides class name merging with Tailwind CSS conflict resolution.
 *
 * Responsibilities :
 * - Merge class names using clsx and tailwind-merge
 * - Resolve Tailwind CSS class conflicts automatically
 *
 * Features / Functionality :
 * - cn() helper for conditional and merged class names
 *
 * Tech Stack   : TypeScript, clsx, tailwind-merge
 * Layer        : Frontend
 *
 * Dependencies : clsx, tailwind-merge
 *
 * Notes        : None
 ************************************************************/

import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
