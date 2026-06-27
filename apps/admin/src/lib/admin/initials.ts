/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : initials
 * Scope        : Admin — App Shell / User Identity
 *
 * Description  : Pure presentation helper that derives avatar initials from a
 *                user's display name for the admin App Shell. Replaces the
 *                inline toInitials() previously defined in app/layout.tsx.
 *
 * Responsibilities :
 * - Derive up to two uppercase initials from a display name
 * - Return a safe placeholder for empty / whitespace-only names
 *
 * Features / Functionality :
 * - AVATAR_INITIALS_PLACEHOLDER constant ('RG')
 * - toInitials() — first letters of the first two whitespace-separated words
 *
 * Tech Stack   : TypeScript
 * Layer        : Presentation (pure helper, no I/O, no business logic)
 *
 ************************************************************/

/**
 * Fixed placeholder used when a display name yields no usable initials.
 * Length is <= 2 to match the avatar's two-letter footprint.
 */
export const AVATAR_INITIALS_PLACEHOLDER = 'RG'

/**
 * Derive up to two uppercase initials from a display name.
 *
 * The initials are taken from the first letters of the first two
 * whitespace-separated words. Empty or whitespace-only names yield the safe
 * {@link AVATAR_INITIALS_PLACEHOLDER}. The returned string always has length
 * <= 2.
 *
 * Pure function: no I/O, no side effects, no business logic.
 */
export function toInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) {
    return AVATAR_INITIALS_PLACEHOLDER
  }
  const letters = parts.slice(0, 2).map((p) => p.charAt(0).toUpperCase())
  return letters.join('')
}
