'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'

type NavItem = {
  label: string
  href: string
  icon: string
  minRole?: string
}

type NavSection = {
  title: string
  items: NavItem[]
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Operations',
    items: [
      { label: 'Dashboard', href: '/admin', icon: '📊' },
      { label: 'Bookings', href: '/admin/bookings', icon: '📅' },
      { label: 'Waitlist', href: '/admin/waitlist', icon: '⏳' },
    ],
  },
  {
    title: 'CRM',
    items: [
      { label: 'Customers', href: '/admin/customers', icon: '👥' },
      { label: 'Leads', href: '/admin/leads', icon: '🎯' },
    ],
  },
  {
    title: 'Staff',
    items: [
      { label: 'Staff', href: '/admin/staff', icon: '💇', minRole: 'manager' },
      { label: 'Schedule', href: '/admin/schedule', icon: '🗓️', minRole: 'manager' },
      { label: 'Leave', href: '/admin/leave', icon: '🏖️' },
    ],
  },
  {
    title: 'Catalog',
    items: [
      { label: 'Services', href: '/admin/services', icon: '✨', minRole: 'manager' },
      { label: 'Offers', href: '/admin/offers', icon: '🏷️', minRole: 'manager' },
      { label: 'Memberships', href: '/admin/memberships', icon: '💎' },
    ],
  },
  {
    title: 'Finance',
    items: [
      { label: 'Billing', href: '/admin/billing', icon: '🧾' },
      { label: 'Reports', href: '/admin/reports', icon: '📈', minRole: 'manager' },
    ],
  },
  {
    title: 'System',
    items: [
      { label: 'Settings', href: '/admin/settings', icon: '⚙️', minRole: 'manager' },
      { label: 'Branches', href: '/admin/branches', icon: '🏢', minRole: 'owner' },
      { label: 'Users', href: '/admin/users', icon: '🔑', minRole: 'owner' },
      { label: 'Integrations', href: '/admin/integrations', icon: '🔌', minRole: 'developer' },
      { label: 'Logs', href: '/admin/logs', icon: '📋', minRole: 'developer' },
    ],
  },
]

// Placeholder: in production, this would come from session context
const CURRENT_ROLE = 'developer'

const ROLE_LEVELS: Record<string, number> = {
  customer: 0,
  staff: 1,
  receptionist: 2,
  manager: 3,
  owner: 4,
  developer: 5,
}

function hasAccess(minRole?: string): boolean {
  if (!minRole) return true
  return (ROLE_LEVELS[CURRENT_ROLE] ?? 0) >= (ROLE_LEVELS[minRole] ?? 0)
}

function isActive(pathname: string, href: string): boolean {
  if (href === '/admin') return pathname === '/admin'
  return pathname.startsWith(href)
}

export function AdminSidebar({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const pathname = usePathname()

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-50 h-full w-64 bg-cloud-gray border-r border-outline-gray overflow-y-auto transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:z-auto ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo */}
        <div className="flex items-center gap-2 px-5 py-5 border-b border-outline-gray">
          <span className="font-display text-lg text-cocoa-dark tracking-tight">
            Royal Glow
          </span>
          <span className="inline-flex items-center rounded-full bg-cocoa-dark text-canvas-white text-[10px] font-ui uppercase tracking-wider px-2 py-0.5">
            Admin
          </span>
        </div>

        {/* Navigation */}
        <nav className="px-3 py-4" aria-label="Admin navigation">
          {NAV_SECTIONS.map((section) => {
            const visibleItems = section.items.filter((item) =>
              hasAccess(item.minRole)
            )
            if (visibleItems.length === 0) return null

            return (
              <div key={section.title} className="mb-4">
                <p className="px-3 mb-1 text-[11px] font-ui uppercase tracking-widest text-dusty-gray">
                  {section.title}
                </p>
                <ul className="space-y-0.5">
                  {visibleItems.map((item) => {
                    const active = isActive(pathname, item.href)
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={onClose}
                          className={`flex items-center gap-2.5 px-3 py-2 rounded-[6px] text-sm transition-colors duration-150 ${
                            active
                              ? 'bg-canvas-white text-cocoa-dark font-medium shadow-sm'
                              : 'text-warm-gray hover:bg-canvas-white/60 hover:text-cocoa-dark'
                          }`}
                          aria-current={active ? 'page' : undefined}
                        >
                          <span className="text-base" aria-hidden="true">
                            {item.icon}
                          </span>
                          <span className="font-sans">{item.label}</span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </nav>
      </aside>
    </>
  )
}
