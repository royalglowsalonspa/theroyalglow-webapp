/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : AdminShell
 * Scope        : Admin Portal — App_Shell (Sidebar + Top_Bar + content)
 *
 * Description  : Client-side App_Shell composing the owned-source shadcn
 *                `SidebarProvider` / `Sidebar` / `SidebarInset` block around the
 *                Sidebar content, the Top_Bar, the Command palette + Sonner
 *                toaster, and the route content. The signed-in user's role and
 *                display details are resolved on the server and passed in, so
 *                the sidebar shows only the navigation the user may see.
 *
 *                Responsive: the shadcn Sidebar renders a PERSISTENT rail at
 *                ≥1024px and a Sheet OVERLAY DRAWER below 1024px (the rail-to-
 *                drawer breakpoint is set to 1024px in `use-mobile.ts`). The
 *                Sheet supplies focus trap, focus return to the toggle, Esc /
 *                backdrop close, and scroll lock for free (Req 6.4–6.9).
 *
 * Responsibilities :
 * - Render Sidebar + Top Bar + content on every admin route (Req 6.1, 22.1)
 * - Provide the persistent ≥1024px rail and the <1024px overlay drawer
 * - Mount the Command palette (⌘K) and the Sonner toaster once
 * - Wrap route content in `RouteTransition` (≤300ms; reduced-motion safe)
 *
 * Tech Stack   : Next.js 16, React (Client Component), TypeScript, shadcn
 *                Sidebar, motion
 * Layer        : Presentation (Shell / Layout Component)
 *
 * Dependencies : AdminSidebar, TopBar, Toaster, RouteTransition,
 *                RealtimeProvider, @/components/ui/sidebar, @/lib/rbac
 *
 * Notes        : 'use client' required for the interactive sidebar state.
 *                Presentation-layer only — no data, API, RBAC, or
 *                business-logic changes. `userInitials` is accepted for the
 *                server-resolved data flow; the avatar initials are derived
 *                downstream by UserIdentity from `userName`.
 *
 * Requirements : 6.1, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 22.1
 ************************************************************/

'use client'

import { AdminSidebar } from '@/components/layout/admin-sidebar'
import { TopBar } from '@/components/layout/top-bar'
import { RealtimeProvider } from '@/components/realtime/realtime-provider'
import { RouteTransition } from '@/components/ui/motion/motion-presence'
import { Sidebar, SidebarInset, SidebarProvider, SidebarRail } from '@/components/ui/sidebar'
import { Toaster } from '@/components/ui/toaster'
import { resolveRoleLevel } from '@/lib/rbac'
import { usePathname } from 'next/navigation'

type AdminShellProps = {
  /** Resolved role from the signed-in session (drives nav visibility). */
  role: string
  /** Display name shown in the top bar. */
  userName: string
  /**
   * Two-letter avatar initials derived from the user's name on the server.
   * Kept for the server-resolved data flow; the rendered avatar initials are
   * derived downstream by UserIdentity from {@link userName}.
   */
  userInitials: string
  children: React.ReactNode
}

/**
 * App_Shell wrapping every admin route.
 *
 * @param props - {@link AdminShellProps}
 * @returns The rendered shell (sidebar rail + mobile drawer + top bar + main).
 */
export function AdminShell({ role, userName, userInitials, children }: AdminShellProps) {
  const roleLevel = resolveRoleLevel(role)
  const roleLabel = role.length > 0 ? role.charAt(0).toUpperCase() + role.slice(1) : 'Member'
  const pathname = usePathname()

  // The V2 redesign preview (`/v2/*`) owns its own App_Shell (sidebar + top
  // bar) via apps/admin/src/app/v2/layout.tsx, so the V1 chrome is bypassed
  // entirely for those paths. V1 routes are untouched and keep the shell below.
  if (pathname?.startsWith('/v2')) {
    return <>{children}</>
  }

  return (
    <RealtimeProvider>
      <SidebarProvider>
        <Sidebar collapsible="icon" className="border-r border-outline-gray bg-cloud-gray">
          <AdminSidebar roleLevel={roleLevel} />
          <SidebarRail />
        </Sidebar>

        <SidebarInset className="flex min-h-svh min-w-0 flex-col bg-canvas-white">
          <TopBar
            roleLevel={roleLevel}
            userName={userName}
            roleLabel={roleLabel}
            userInitials={userInitials}
          />
          <div className="flex flex-1 flex-col gap-4 overflow-x-hidden p-4 lg:p-6">
            <RouteTransition routeKey={pathname}>{children}</RouteTransition>
          </div>
          <Toaster />
        </SidebarInset>
      </SidebarProvider>
    </RealtimeProvider>
  )
}
