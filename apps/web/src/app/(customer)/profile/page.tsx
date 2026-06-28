/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : ProfilePage
 * Scope        : Customer Pages
 *
 * Description  : User profile page displaying account info, avatar, member-since
 *                date, notification preferences, and sign-out action.
 *
 * Responsibilities :
 * - Fetch authenticated session and display user identity card
 * - Read persisted notification preferences and pass them to the client form
 * - Mount the SignOutButton client component
 *
 * Features / Functionality :
 * - Avatar from Google OAuth or initial-letter fallback
 * - Read-only email display with "read-only" badge
 * - Functional notification preference toggles (NotificationPreferencesForm)
 *
 * Tech Stack   : React, Next.js 16 (App Router), Tailwind CSS v4, Better Auth
 * Layer        : Presentation
 *
 * Dependencies : auth, @rgss/db/queries, next (Metadata, headers, redirect),
 *                NotificationPreferencesForm, SignOutButton
 *
 * Notes        :
 * - Protected route; redirects to / (homepage) if no session
 ************************************************************/

import { auth } from '@/lib/auth-server'
import { getNotificationPreferences } from '@rgss/db/queries'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import {
  type NotificationPreferences,
  NotificationPreferencesForm,
} from './NotificationPreferencesForm'
import { SignOutButton } from './sign-out-button'

export const metadata: Metadata = {
  title: 'My Profile',
  description: 'Manage your Royal Glow account.',
  robots: { index: false, follow: false },
}

function formatMemberSince(value: Date | string | null | undefined): string {
  if (!value) return '—'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

export default async function ProfilePage() {
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session) {
    redirect('/')
  }

  const { user } = session
  const memberSince = formatMemberSince((user as { createdAt?: Date | string }).createdAt)
  const initial = user.name?.trim().charAt(0).toUpperCase() || 'G'

  // Read the persisted preference flags. Falls back to the schema defaults when
  // the profile is missing (e.g. onboarding not yet completed).
  const savedPrefs = await getNotificationPreferences(user.id)
  const initialPrefs: NotificationPreferences = {
    appointmentRemindersEnabled: savedPrefs?.appointmentRemindersEnabled ?? true,
    membershipAlertsEnabled: savedPrefs?.membershipAlertsEnabled ?? true,
    marketingConsent: savedPrefs?.marketingConsent ?? false,
  }

  return (
    <div className="mx-auto max-w-[800px] px-5 py-10 lg:py-14">
      <header className="mb-8">
        <p className="font-ui text-[11px] uppercase tracking-[2px] text-warm-stone mb-2">
          Your account
        </p>
        <h1 className="font-display text-[clamp(32px,5vw,48px)] text-cocoa-dark tracking-tight leading-[1.05]">
          My Profile
        </h1>
      </header>

      {/* Identity card */}
      <section className="rounded-[6px] border border-cloud-gray bg-canvas-white p-6 mb-6">
        <div className="flex items-center gap-4 mb-6">
          {user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.image} alt="" className="w-16 h-16 rounded-full object-cover" />
          ) : (
            <div
              className="w-16 h-16 rounded-full bg-royal-gold flex items-center justify-center font-display text-[24px] text-cocoa-dark"
              aria-hidden="true"
            >
              {initial}
            </div>
          )}
          <div>
            <p className="font-display text-[22px] text-cocoa-dark tracking-tight">{user.name}</p>
            <p className="font-sans text-[14px] text-dusty-gray">Member since {memberSince}</p>
          </div>
        </div>

        <dl className="space-y-4">
          <div>
            <dt className="font-ui text-[11px] uppercase tracking-[1px] text-warm-stone mb-1">
              Name
            </dt>
            <dd className="font-sans text-[15px] text-cocoa-dark">{user.name}</dd>
          </div>
          <div>
            <dt className="font-ui text-[11px] uppercase tracking-[1px] text-warm-stone mb-1">
              Email
            </dt>
            <dd className="font-sans text-[15px] text-cocoa-dark">
              {user.email}
              <span className="ml-2 font-ui text-[11px] uppercase tracking-[0.5px] text-dusty-gray">
                (read-only)
              </span>
            </dd>
          </div>
          <div>
            <dt className="font-ui text-[11px] uppercase tracking-[1px] text-warm-stone mb-1">
              Member Since
            </dt>
            <dd className="font-sans text-[15px] text-cocoa-dark">{memberSince}</dd>
          </div>
        </dl>
      </section>

      {/* Notification preferences */}
      <section className="rounded-[6px] border border-cloud-gray bg-canvas-white p-6 mb-6">
        <h2 className="font-display text-[20px] text-cocoa-dark tracking-tight mb-1">
          Notification Preferences
        </h2>
        <p className="font-sans text-[13px] text-dusty-gray mb-5">
          Choose how you would like to hear from us.
        </p>

        <NotificationPreferencesForm initial={initialPrefs} />
      </section>

      {/* Sign out */}
      <SignOutButton />
    </div>
  )
}
