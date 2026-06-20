/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : AdminShell
 * Scope        : Admin Portal — Shell & Navigation
 *
 * Description  : Client-side shell component providing the admin portal's
 *                sidebar, top bar, and responsive layout. The signed-in user's
 *                role and display details are resolved on the server and passed
 *                in, so the sidebar shows only the navigation the user may see
 *                (no CURRENT_ROLE placeholder).
 *
 * Responsibilities :
 * - Render the role-filtered sidebar navigation (AdminSidebar)
 * - Provide a top bar with hamburger toggle, breadcrumb, notifications, user
 * - Manage mobile sidebar open/close state
 *
 * Features / Functionality :
 * - Responsive sidebar (persistent ≥1024px, overlay drawer <1024px)
 * - Mobile hamburger menu toggle with accessible label
 * - Notification bell + user avatar (real name, initials, role) in top bar
 *
 * Tech Stack   : Next.js 16, React (Client Component), TypeScript
 * Layer        : Presentation (Shell / Layout Component)
 *
 * Dependencies : AdminSidebar, NotificationBell, RealtimeProvider, @/lib/rbac,
 *                React useState
 *
 * Notes        : 'use client' required for interactive sidebar state.
 ************************************************************/

'use client'

import { AdminSidebar } from '@/components/layout/admin-sidebar'
import { NotificationBell } from '@/components/notifications/notification-bell'
import { RealtimeProvider } from '@/components/realtime/realtime-provider'
import { resolveRoleLevel } from '@/lib/rbac'
import { useState } from 'react'

type AdminShellProps = {
  /** Resolved role from the signed-in session (drives nav visibility). */
  role: string
  /** Display name shown in the top bar. */
  userName: string
  /** Two-letter avatar initials derived from the user's name. */
  userInitials: string
  children: React.ReactNode
}

export function AdminShell({ role, userName, userInitials, children }: AdminShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const roleLevel = resolveRoleLevel(role)

  return (
    <RealtimeProvider>
      <div className="flex h-screen bg-canvas-white">
        {/* Sidebar */}
        <AdminSidebar
          roleLevel={roleLevel}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        {/* Main content area */}
        <div className="flex flex-1 flex-col min-w-0">
          {/* Top bar */}
          <header className="flex items-center justify-between h-14 px-4 lg:px-6 border-b border-cloud-gray bg-canvas-white shrink-0">
            {/* Left: hamburger + breadcrumb */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-1.5 rounded-[6px] text-warm-gray hover:bg-cloud-gray transition-colors"
                aria-label="Open navigation menu"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              </button>
              <nav aria-label="Breadcrumb">
                <span className="text-sm text-dusty-gray font-sans">Admin</span>
              </nav>
            </div>

            {/* Right: notifications + user */}
            <div className="flex items-center gap-3">
              {/* Notifications bell */}
              <NotificationBell />

              {/* User avatar + role */}
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-cloud-gray flex items-center justify-center">
                  <span className="text-xs font-ui text-warm-gray">{userInitials}</span>
                </div>
                <div className="hidden sm:block">
                  <p className="text-sm font-medium text-cocoa-dark font-sans leading-tight">
                    {userName}
                  </p>
                  <span className="text-[10px] font-ui uppercase tracking-wider text-dusty-gray">
                    {role}
                  </span>
                </div>
              </div>
            </div>
          </header>

          {/* Scrollable content */}
          <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
        </div>
      </div>
    </RealtimeProvider>
  )
}
