/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : TopBar
 * Scope        : Admin Portal — App Shell / Top_Bar
 *
 * Description  : Presentation-only horizontal Top_Bar for the admin App_Shell.
 *                Renders the responsive sidebar toggle control, the breadcrumb
 *                trail, the notification bell, and the user identity block.
 *                Extracted from the inline markup previously embedded in
 *                admin-shell.tsx so the shell composes a single Top_Bar unit.
 *
 * Responsibilities :
 * - Render an icon-only sidebar toggle (lg:hidden) that calls onToggleSidebar
 * - Render the Breadcrumb_Trail (current-route hierarchy)
 * - Render the existing NotificationBell unchanged
 * - Render the UserIdentity block (avatar + name + role)
 *
 * Features / Functionality :
 * - Toggle uses the Icon wrapper over lucide `Menu` with a non-empty accessible
 *   label (icon-only control → labelled, not decorative) (Req 2.5)
 * - Brand-token Tailwind utilities only (no colour / size literals) (Req 1.2)
 *
 * Tech Stack   : Next.js 16, React (Client Component), TypeScript, Tailwind CSS
 * Layer        : Presentation (App Shell / Layout Component)
 *
 * Dependencies : @/components/layout/breadcrumb,
 *                @/components/layout/user-identity,
 *                @/components/notifications/notification-bell,
 *                @/components/ui/icon, lucide-react
 *
 * Notes        : Presentation-layer only — no data, API, RBAC, or
 *                business-logic changes. Consumed by AdminShell.
 *
 * Requirements : 3.2
 ************************************************************/

'use client'

import { Breadcrumb } from '@/components/layout/breadcrumb'
import { UserIdentity } from '@/components/layout/user-identity'
import { NotificationBell } from '@/components/notifications/notification-bell'
import { Icon } from '@/components/ui/icon'
import { Menu } from 'lucide-react'

type TopBarProps = {
  /** Signed-in user's display name shown in the user identity block. */
  userName: string
  /** Human-readable role label for the signed-in user. */
  role: string
  /** Opens the sidebar overlay drawer (invoked by the toggle control). */
  onToggleSidebar: () => void
  /**
   * Ref to the sidebar toggle button. The shell uses it to return keyboard
   * focus to the toggle when the overlay drawer closes (Req 3.9).
   */
  toggleRef?: React.Ref<HTMLButtonElement>
}

/**
 * Top_Bar for the admin App_Shell.
 *
 * Renders (left → right): the sidebar toggle (hidden at >=1024px where the
 * sidebar is persistent), the breadcrumb trail, the notification bell, and the
 * user identity block (Req 3.2).
 *
 * @param props - {@link TopBarProps}
 * @returns The rendered Top_Bar header element.
 */
export function TopBar({ userName, role, onToggleSidebar, toggleRef }: TopBarProps) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-cloud-gray bg-canvas-white px-4 lg:px-6">
      {/* Left: sidebar toggle + breadcrumb */}
      <div className="flex items-center gap-3">
        <button
          ref={toggleRef}
          type="button"
          onClick={onToggleSidebar}
          className="flex h-11 w-11 min-h-11 min-w-11 items-center justify-center rounded-[6px] text-warm-gray transition-colors hover:bg-cloud-gray focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cocoa-dark lg:hidden"
        >
          <Icon icon={Menu} label="Open navigation menu" size={20} />
        </button>
        <Breadcrumb />
      </div>

      {/* Right: notifications + user identity */}
      <div className="flex items-center gap-3">
        <NotificationBell />
        <UserIdentity userName={userName} role={role} />
      </div>
    </header>
  )
}
