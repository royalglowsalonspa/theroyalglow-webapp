import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth-server'
import { SignOutButton } from './sign-out-button'

export const metadata: Metadata = {
  title: 'My Profile',
  description: 'Manage your Royal Glow account.',
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
    redirect('/sign-in')
  }

  const { user } = session
  const memberSince = formatMemberSince(
    (user as { createdAt?: Date | string }).createdAt
  )
  const initial = user.name?.trim().charAt(0).toUpperCase() || 'G'

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
            <img
              src={user.image}
              alt=""
              className="w-16 h-16 rounded-full object-cover"
            />
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

      {/* Notification preferences (UI only) */}
      <section className="rounded-[6px] border border-cloud-gray bg-canvas-white p-6 mb-6">
        <h2 className="font-display text-[20px] text-cocoa-dark tracking-tight mb-1">
          Notification Preferences
        </h2>
        <p className="font-sans text-[13px] text-dusty-gray mb-5">
          Choose how you would like to hear from us.
        </p>

        <ul className="space-y-4">
          {[
            {
              id: 'pref-booking',
              label: 'Booking updates',
              desc: 'Confirmations, reminders and status changes.',
              checked: true,
            },
            {
              id: 'pref-offers',
              label: 'Offers & promotions',
              desc: 'Seasonal deals and members-only offers.',
              checked: false,
            },
            {
              id: 'pref-birthday',
              label: 'Birthday treats',
              desc: 'A little something on your special day.',
              checked: true,
            },
          ].map((pref) => (
            <li key={pref.id} className="flex items-start justify-between gap-4">
              <label htmlFor={pref.id} className="flex-1 cursor-pointer">
                <span className="block font-sans text-[15px] text-cocoa-dark">{pref.label}</span>
                <span className="block font-sans text-[13px] text-dusty-gray">{pref.desc}</span>
              </label>
              <input
                id={pref.id}
                type="checkbox"
                defaultChecked={pref.checked}
                disabled
                className="mt-1 w-4 h-4 accent-deep-gold"
                aria-label={pref.label}
              />
            </li>
          ))}
        </ul>

        <p className="mt-5 font-sans text-[12px] text-dusty-gray">
          Preference management is coming soon.
        </p>
      </section>

      {/* Sign out */}
      <SignOutButton />
    </div>
  )
}
