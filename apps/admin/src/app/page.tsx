/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Admin Dashboard Page
 * Scope        : Admin Portal — Dashboard
 *
 * Description  : Main admin dashboard page displaying IST-aware
 *                greeting, today's date, live KPIs, and quick actions.
 *
 * Responsibilities :
 * - Render time-of-day greeting based on IST timezone
 * - Display today's date in DD/MM/YYYY Indian format
 * - Provide quick-action navigation links to key admin sections
 *
 * Features / Functionality :
 * - IST-aware greeting (morning/afternoon/evening)
 * - DashboardOverview component with today's stats
 * - Quick action buttons for bookings, schedule, and reports
 *
 * Tech Stack   : Next.js 16 (App Router), React, TypeScript
 * Layer        : Presentation (Page)
 *
 * Dependencies : next (Metadata, Link), DashboardOverview component,
 *                Icon wrapper + lucide-react icons
 *
 * Notes        :
 * - Server Component — IST calculation runs on the server
 * - Uses ONLY semantic Brand-Token utilities and lucide icons via the Icon
 *   wrapper — no emoji glyphs and no hex / px / radius literals (Req 1.2, 2.3)
 ************************************************************/

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { CalendarDays, ClipboardList, Hand, TrendingUp } from 'lucide-react'
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
        <h1 className="text-2xl font-display text-cocoa-dark tracking-tight inline-flex items-center gap-2">
          {getGreeting()}
          <Icon icon={Hand} decorative className="text-deep-gold" />
        </h1>
        <p className="text-sm text-dusty-gray font-sans mt-0.5">{getTodayIST()}</p>
      </div>

      {/* Live KPIs + recent bookings */}
      <DashboardOverview />

      {/* Quick Actions */}
      <section>
        <h2 className="text-lg font-display text-cocoa-dark mb-3">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <Button asChild className="font-ui">
            <Link href="/bookings">
              <Icon icon={ClipboardList} decorative size={16} />
              View Bookings
            </Link>
          </Button>
          <Button asChild variant="outline" className="font-ui">
            <Link href="/schedule">
              <Icon icon={CalendarDays} decorative size={16} />
              View Schedule
            </Link>
          </Button>
          <Button asChild variant="outline" className="font-ui">
            <Link href="/reports">
              <Icon icon={TrendingUp} decorative size={16} />
              Generate Report
            </Link>
          </Button>
        </div>
      </section>
    </div>
  )
}
