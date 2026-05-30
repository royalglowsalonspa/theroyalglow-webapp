import type { Metadata } from 'next'
import Link from 'next/link'
import { DashboardOverview } from './dashboard-overview'

export const metadata: Metadata = {
  title: 'Dashboard',
}

function getGreeting(): string {
  // IST = UTC + 5:30
  const now = new Date()
  const istHour = (now.getUTCHours() + 5 + Math.floor((now.getUTCMinutes() + 30) / 60)) % 24
  if (istHour < 12) return 'Good morning'
  if (istHour < 17) return 'Good afternoon'
  return 'Good evening'
}

function getTodayIST(): string {
  const now = new Date()
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(now)
}

export default function AdminDashboardPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-display text-cocoa-dark tracking-tight">
          {getGreeting()} 👋
        </h1>
        <p className="text-sm text-dusty-gray font-sans mt-0.5">{getTodayIST()}</p>
      </div>

      {/* Live KPIs + recent bookings */}
      <DashboardOverview />

      {/* Quick Actions */}
      <section>
        <h2 className="text-lg font-display text-cocoa-dark mb-3">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/admin/bookings"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-[6px] bg-cocoa-dark text-canvas-white text-sm font-ui hover:bg-warm-gray transition-colors"
          >
            <span aria-hidden="true">📋</span>
            View Bookings
          </Link>
          <button
            type="button"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-[6px] border border-cloud-gray bg-canvas-white text-cocoa-dark text-sm font-ui hover:bg-cloud-gray transition-colors"
          >
            <span aria-hidden="true">🗓️</span>
            View Schedule
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-[6px] border border-cloud-gray bg-canvas-white text-cocoa-dark text-sm font-ui hover:bg-cloud-gray transition-colors"
          >
            <span aria-hidden="true">📈</span>
            Generate Report
          </button>
        </div>
      </section>
    </div>
  )
}
