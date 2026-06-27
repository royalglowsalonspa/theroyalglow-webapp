/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : UserIdentity
 * Scope        : Admin Portal — App Shell / Top Bar
 *
 * Description  : Presentation-only user identity block for the admin Top_Bar.
 *                Renders an avatar (up to two initials) alongside the signed-in
 *                user's display name and role label. Replaces the inline user
 *                block previously embedded in admin-shell.tsx.
 *
 * Responsibilities :
 * - Render an avatar circle showing <=2 uppercase initials
 * - Show the display name + role label at >=1024px (lg:)
 * - Hide the name/role text below 1024px while keeping the avatar visible and
 *   operable as a >=44x44px interactive control
 *
 * Features / Functionality :
 * - Initials derived via toInitials() (or supplied explicitly)
 * - Avatar rendered as a button sized min-h-11 min-w-11 (44x44 CSS px)
 * - Brand-token Tailwind utilities only (no hex / raw literals)
 *
 * Tech Stack   : Next.js 16, React, TypeScript
 * Layer        : Presentation (Shell / Layout Component)
 *
 * Dependencies : @/lib/admin/initials (pure toInitials helper)
 *
 * Notes        : Presentation-layer only. No business logic, no I/O.
 ************************************************************/

import { toInitials } from '@/lib/admin/initials'

type UserIdentityProps = {
  /** Signed-in user's display name. */
  userName: string
  /** Human-readable role label for the signed-in user. */
  role: string
  /**
   * Up to two uppercase initials for the avatar. Derived from {@link userName}
   * via {@link toInitials} when not supplied.
   */
  initials?: string
}

/**
 * User identity block for the admin Top_Bar.
 *
 * At >=1024px the avatar is shown beside the display name and role label. Below
 * 1024px the text block is hidden (`hidden lg:block`) while the avatar remains
 * visible and operable as a >=44x44px interactive control (Req 14.2, 14.4,
 * 14.5).
 */
export function UserIdentity({ userName, role, initials }: UserIdentityProps) {
  const avatarInitials = initials ?? toInitials(userName)

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label={`${userName}, ${role}`}
        className="flex h-11 w-11 min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full bg-cloud-gray text-warm-gray transition-colors hover:bg-outline-gray focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cocoa-dark"
      >
        <span aria-hidden="true" className="font-ui text-xs">
          {avatarInitials}
        </span>
      </button>

      <div className="hidden lg:block" data-testid="user-identity-text">
        <p className="font-sans text-sm font-medium leading-tight text-cocoa-dark">{userName}</p>
        <span className="font-ui text-[10px] uppercase tracking-wider text-dusty-gray">{role}</span>
      </div>
    </div>
  )
}
