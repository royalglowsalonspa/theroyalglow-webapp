/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : AdminShell
 * Scope        : Admin Portal — App_Shell (Sidebar + Top_Bar + content)
 *
 * Description  : Client-side App_Shell composing the Sidebar, the Top_Bar, and
 *                the page content region around every admin route (Req 3.1,
 *                17.1). The signed-in user's role and display details are
 *                resolved on the server and passed in, so the sidebar shows
 *                only the navigation the user may see.
 *
 * Responsive sidebar — CHOSEN APPROACH (design.md §"AdminShell / AdminSidebar
 * / TopBar / Breadcrumb"): reuse the installed `@radix-ui/react-dialog` for the
 * MOBILE (<1024px) overlay drawer, which supplies focus trap, focus return to
 * the toggle, `Esc` / backdrop close, and background scroll lock for free
 * (Req 3.6–3.9). At >=1024px the sidebar is a PERSISTENT static rail rendered
 * as plain `<aside>` markup (no dialog) (Req 3.4). `AdminSidebar` renders only
 * the inner logo + nav content; this shell owns the positioning so there is
 * exactly ONE rendered nav landmark per breakpoint (rail is `hidden lg:block`,
 * the drawer is `lg:hidden` and only mounted while open) — no duplicate
 * overlays, no duplicate landmarks.
 *
 * Responsibilities :
 * - Render Sidebar + Top_Bar + content on every admin page (Req 3.1, 17.1)
 * - Provide the persistent >=1024px rail (Req 3.4) and the <1024px overlay
 *   drawer with dimming backdrop, focus trap/return, Esc/backdrop/nav-item/
 *   toggle close (Req 3.5–3.9)
 * - Manage the mobile sidebar open/close state
 *
 * Tech Stack   : Next.js 16, React (Client Component), TypeScript, Tailwind,
 *                @radix-ui/react-dialog
 * Layer        : Presentation (Shell / Layout Component)
 *
 * Dependencies : AdminSidebar, TopBar, RealtimeProvider, @/lib/rbac,
 *                @radix-ui/react-dialog, @rgss/ui/lib/utils, React useState
 *
 * Notes        : 'use client' required for interactive drawer state.
 *                Presentation-layer only — no data, API, RBAC, or
 *                business-logic changes. `userInitials` is accepted for the
 *                server-resolved data flow; the avatar initials are derived
 *                downstream by TopBar -> UserIdentity from `userName`.
 *
 * Requirements : 3.1, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 17.1
 ************************************************************/

'use client'

import { AdminSidebar } from '@/components/layout/admin-sidebar'
import { TopBar } from '@/components/layout/top-bar'
import { RealtimeProvider } from '@/components/realtime/realtime-provider'
import { resolveRoleLevel } from '@/lib/rbac'
import * as Dialog from '@radix-ui/react-dialog'
import { cn } from '@rgss/ui/lib/utils'
import { useRef, useState } from 'react'

type AdminShellProps = {
  /** Resolved role from the signed-in session (drives nav visibility). */
  role: string
  /** Display name shown in the top bar. */
  userName: string
  /**
   * Two-letter avatar initials derived from the user's name on the server.
   * Kept for the server-resolved data flow; the rendered avatar initials are
   * derived downstream by TopBar -> UserIdentity from {@link userName}.
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
export function AdminShell({ role, userName, children }: AdminShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const roleLevel = resolveRoleLevel(role)

  return (
    <RealtimeProvider>
      <div className="flex h-screen bg-canvas-white">
        {/* Persistent rail (>=1024px) — plain static markup, no dialog (Req 3.4) */}
        <aside className="hidden w-64 shrink-0 border-r border-outline-gray bg-cloud-gray lg:block">
          <AdminSidebar roleLevel={roleLevel} />
        </aside>

        {/* Mobile overlay drawer (<1024px) — Radix Dialog supplies focus trap,
            focus return to the toggle, Esc / backdrop close, and scroll lock
            (Req 3.5–3.9). */}
        <Dialog.Root open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <Dialog.Portal>
            {/* Dimming backdrop (Req 3.6) */}
            <Dialog.Overlay
              className={cn(
                'fixed inset-0 z-40 bg-cocoa-dark/40 lg:hidden',
                'transition-opacity duration-200 ease-in-out motion-reduce:transition-none',
                'data-[state=closed]:opacity-0 data-[state=open]:opacity-100',
              )}
            />

            {/* Left-edge drawer panel */}
            <Dialog.Content
              aria-describedby={undefined}
              onCloseAutoFocus={(event) => {
                // The toggle lives in the TopBar (outside Dialog.Root), so Radix
                // has no trigger to restore focus to. Return focus to the toggle
                // explicitly when the drawer closes (Req 3.9).
                event.preventDefault()
                toggleRef.current?.focus()
              }}
              className={cn(
                'fixed inset-y-0 left-0 z-50 flex w-64 flex-col lg:hidden',
                'border-r border-outline-gray bg-cloud-gray shadow-lg',
                'transition-transform duration-200 ease-in-out motion-reduce:transition-none',
                'data-[state=closed]:-translate-x-full data-[state=open]:translate-x-0',
              )}
            >
              {/* Accessible name for the dialog (visually hidden) */}
              <Dialog.Title className="sr-only">Navigation menu</Dialog.Title>
              {/* Nav-item activation closes the drawer (Req 3.7) */}
              <AdminSidebar roleLevel={roleLevel} onNavigate={() => setSidebarOpen(false)} />
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>

        {/* Main content column */}
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar
            userName={userName}
            role={role}
            onToggleSidebar={() => setSidebarOpen(true)}
            toggleRef={toggleRef}
          />
          <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
        </div>
      </div>
    </RealtimeProvider>
  )
}
