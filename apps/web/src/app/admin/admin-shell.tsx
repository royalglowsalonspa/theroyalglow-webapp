'use client'

import { useState } from 'react'
import { AdminSidebar } from '@/components/admin/AdminSidebar'

export function AdminShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-screen bg-canvas-white">
      {/* Sidebar */}
      <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

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
              <span className="text-sm text-dusty-gray font-sans">
                Admin
              </span>
            </nav>
          </div>

          {/* Right: notifications + user */}
          <div className="flex items-center gap-3">
            {/* Notifications bell */}
            <button
              type="button"
              className="relative p-1.5 rounded-[6px] text-warm-gray hover:bg-cloud-gray transition-colors"
              aria-label="Notifications"
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
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
              {/* Notification dot */}
              <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-error" aria-hidden="true" />
            </button>

            {/* User avatar + role */}
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-cloud-gray flex items-center justify-center">
                <span className="text-xs font-ui text-warm-gray">RG</span>
              </div>
              <div className="hidden sm:block">
                <p className="text-sm font-medium text-cocoa-dark font-sans leading-tight">
                  Admin User
                </p>
                <span className="text-[10px] font-ui uppercase tracking-wider text-dusty-gray">
                  Developer
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* Scrollable content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
