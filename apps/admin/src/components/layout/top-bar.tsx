/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : TopBar
 * Scope        : Admin Portal — App Shell / Top_Bar
 *
 * Description  : Horizontal Top_Bar for the admin App_Shell, modelled on the
 *                canonical shadcn `sidebar-07` header. Holds the shadcn
 *                `SidebarTrigger` (toggles the icon rail on desktop / opens the
 *                overlay drawer on mobile), a vertical `Separator`, the
 *                Breadcrumb trail, and the right-hand actions (Command palette
 *                ⌘K + NotificationBell).
 *
 *                The header height animates from `h-16` to `h-12` when the
 *                sidebar collapses to the icon rail
 *                (`group-has-data-[collapsible=icon]/sidebar-wrapper:h-12` +
 *                `transition-[width,height] ease-linear`), giving the smooth,
 *                responsive collapse the sidebar-07 reference shows. The brand
 *                and user menu live in the Sidebar (header + footer), so the
 *                brand appears exactly once.
 *
 * Responsibilities :
 * - Render the sidebar toggle labelled "Open navigation menu"
 * - Render the Breadcrumb_Trail (current-route hierarchy)
 * - Render the Command-palette trigger + the NotificationBell
 *
 * Tech Stack   : Next.js 16, React (Client Component), TypeScript, shadcn
 * Layer        : Presentation (App Shell / Layout Component)
 *
 * Requirements : 6.2
 ************************************************************/

'use client'

import { Breadcrumb } from '@/components/layout/breadcrumb'
import { CommandPalette } from '@/components/layout/command-palette'
import { UserIdentity } from '@/components/layout/user-identity'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'

type TopBarProps = {
  /** Resolved numeric role level (drives the command-palette destinations). */
  roleLevel: number
  /** Signed-in user's display name (top-right user menu). */
  userName?: string
  /** Human-readable role label for the signed-in user. */
  roleLabel?: string
  /** Signed-in user's email (Gmail), shown in the user dropdown. */
  email?: string
  /** Up-to-two-letter avatar initials. */
  userInitials?: string
}

/**
 * Top_Bar for the admin App_Shell.
 *
 * Left → right: the sidebar toggle, a divider, the breadcrumb trail, then the
 * command-palette trigger and — in the top-right corner — the signed-in user
 * menu (name + role + Account / Log out). Height transitions to `h-12` when the
 * sidebar collapses (Req 6.2).
 *
 * @param props - {@link TopBarProps}
 * @returns The rendered Top_Bar header element.
 */
export function TopBar({
  roleLevel,
  userName = 'Admin User',
  roleLabel = 'Member',
  email,
  userInitials,
}: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b border-outline-gray bg-canvas-white/90 backdrop-blur-md transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
      <div className="flex w-full items-center gap-2 px-3 lg:px-4">
        <SidebarTrigger aria-label="Open navigation menu" className="-ml-1 text-warm-gray" />
        <Separator
          orientation="vertical"
          className="mr-1 data-[orientation=vertical]:h-4 bg-outline-gray"
        />
        <div className="min-w-0">
          <Breadcrumb />
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2 lg:gap-3">
          <CommandPalette roleLevel={roleLevel} />
          <UserIdentity
            userName={userName}
            role={roleLabel}
            email={email}
            initials={userInitials}
          />
        </div>
      </div>
    </header>
  )
}
