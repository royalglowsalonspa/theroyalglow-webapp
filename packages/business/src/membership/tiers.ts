/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 25-10-2026 & Updated - 25-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : membership/tiers
 * Scope        : Business Logic — membership tiers (multi-branch R9.4)
 *
 * Description  : Rules for the tier templates a sale starts from. Pure.
 *
 * Rules :
 * - Receptionists and above create and edit tiers (checked by the route).
 * - Engineering default: only the Developer changes a tier's tax
 *   classification (its SAC code); an unchanged value is not a change.
 ************************************************************/

import { forbidden } from '@rgss/errors'

export const TAX_CLASS_DEVELOPER_ONLY = "Only the Developer changes a tier's tax classification."

/**
 * Throws 403 when someone other than the Developer sets a tax classification
 * that differs from `current` (null for a new tier, which then gets the
 * default).
 */
export function assertTaxClassChange(params: {
  isDeveloper: boolean
  current: string | null
  next: string | undefined
}): void {
  if (params.next === undefined || params.next === params.current || params.isDeveloper) {
    return
  }
  throw forbidden(TAX_CLASS_DEVELOPER_ONLY)
}

/** A tier's slug from its name: lowercase letters and digits joined by hyphens. */
export function tierSlug(name: string): string {
  const slug = name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '')
  return slug || 'tier'
}
