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
 * Dependencies : auth, @rgss/business (IST_TIME_ZONE), @rgss/db/queries,
 *                next (Metadata, headers, redirect),
 *                NotificationPreferencesForm, SignOutButton
 *
 * Notes        :
 * - Protected route; redirects to / (homepage) if no session
 * - `user.createdAt` is a stored-UTC timestamptz, so the member-since formatter
 *   pins IST — without it Intl would resolve the HOST zone and a sign-up in the
 *   18:30–24:00 UTC window would render the previous IST day
 ************************************************************/

import { IST_TIME_ZONE } from '@rgss/business'
import { getNotificationPreferences } from '@rgss/db/queries'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { auth } from '@/lib/auth-server'
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
    timeZone: IST_TIME_ZONE,
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
        <h1 className="font-display font-black text-[clamp(32px,5vw,48px)] text-cocoa-dark tracking-tight leading-[1.05]">
          My Profile
        </h1>
      </header>

      {/* Identity card */}
      <Card className="mb-6 gap-6 p-6">
        <div className="flex items-center gap-4">
          {user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.image} alt="" className="size-16 rounded-full object-cover" />
          ) : (
            <div
              className="flex size-16 items-center justify-center rounded-full bg-royal-gold font-display text-[24px] text-cocoa-dark"
              aria-hidden="true"
            >
              {initial}
            </div>
          )}
          <div>
            <p className="font-display text-[22px] tracking-tight text-cocoa-dark">{user.name}</p>
            <p className="font-ui text-[14px] text-dusty-gray">Member since {memberSince}</p>
          </div>
        </div>

        <dl className="flex flex-col gap-4">
          <div>
            <dt className="mb-1 font-ui text-[11px] uppercase tracking-[1px] text-warm-stone">
              Name
            </dt>
            <dd className="font-sans text-[15px] text-cocoa-dark">{user.name}</dd>
          </div>
          <div>
            <dt className="mb-1 font-ui text-[11px] uppercase tracking-[1px] text-warm-stone">
              Email
            </dt>
            <dd className="flex items-center gap-2 font-sans text-[15px] text-cocoa-dark">
              {user.email}
              <Badge
                variant="secondary"
                className="bg-cloud-gray font-ui text-[11px] uppercase tracking-[0.5px] text-dusty-gray"
              >
                read-only
              </Badge>
            </dd>
          </div>
          <div>
            <dt className="mb-1 font-ui text-[11px] uppercase tracking-[1px] text-warm-stone">
              Member Since
            </dt>
            <dd className="font-ui text-[15px] text-cocoa-dark">{memberSince}</dd>
          </div>
        </dl>
      </Card>

      {/* Notification preferences */}
      <Card className="mb-6 gap-1 p-6">
        <h2 className="font-display text-[20px] tracking-tight text-cocoa-dark">
          Notification Preferences
        </h2>
        <p className="mb-5 font-sans text-[13px] text-dusty-gray">
          Choose how you would like to hear from us.
        </p>

        <NotificationPreferencesForm initial={initialPrefs} />
      </Card>

      {/* Sign out */}
      <SignOutButton />
    </div>
  )
}
