/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : NotificationPreferencesForm
 * Scope        : Customer Pages
 *
 * Description  : Interactive notification-preference toggles for the /profile
 *                page. Reads initial values from the server page and PATCHes
 *                /api/profile/preferences whenever a toggle changes.
 *
 * Responsibilities :
 * - Render an accessible toggle per preference (each with a real <label>)
 * - Persist a single changed flag via PATCH on change (optimistic update)
 * - Disable toggles + show a busy state while a save is in flight
 * - Announce save success / failure via aria-live; revert on failure
 *
 * Features / Functionality :
 * - Three flags: appointment reminders, membership alerts, marketing consent
 * - Optimistic UI with rollback when the request fails
 * - Status region (aria-live="polite") for screen-reader announcements
 * - Respects prefers-reduced-motion (motion-safe utilities only)
 *
 * Tech Stack   : React, TypeScript, Tailwind CSS v4, Next.js 16
 * Layer        : Presentation (Client Component)
 *
 * Dependencies : react
 *
 * Notes        :
 * - Server is the source of truth; the API echoes the persisted flags back.
 ************************************************************/

'use client'

import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useState } from 'react'

export type NotificationPreferences = {
  appointmentRemindersEnabled: boolean
  membershipAlertsEnabled: boolean
  marketingConsent: boolean
}

type PreferenceKey = keyof NotificationPreferences

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

// Static copy for each toggle. `key` maps 1:1 to a boolean column on
// customer_profile and to a field in updateNotificationPreferencesSchema.
const PREFERENCES: ReadonlyArray<{
  key: PreferenceKey
  id: string
  label: string
  desc: string
}> = [
  {
    key: 'appointmentRemindersEnabled',
    id: 'pref-appointment-reminders',
    label: 'Appointment reminders',
    desc: 'Confirmations, reminders and booking status changes.',
  },
  {
    key: 'membershipAlertsEnabled',
    id: 'pref-membership-alerts',
    label: 'Membership alerts',
    desc: 'Hours remaining and expiry reminders for your SPA membership.',
  },
  {
    key: 'marketingConsent',
    id: 'pref-marketing',
    label: 'Offers & promotions',
    desc: 'Seasonal deals, birthday treats and members-only offers.',
  },
]

export function NotificationPreferencesForm({ initial }: { initial: NotificationPreferences }) {
  const [prefs, setPrefs] = useState<NotificationPreferences>(initial)
  const [state, setState] = useState<SaveState>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  const isSaving = state === 'saving'

  async function handleToggle(key: PreferenceKey, nextValue: boolean) {
    const previous = prefs[key]
    // Optimistic update — reflect the change immediately, roll back on failure.
    setPrefs((current) => ({ ...current, [key]: nextValue }))
    setState('saving')
    setErrorMessage('')

    try {
      const res = await fetch('/api/profile/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: nextValue }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? 'Could not save your preferences.')
      }
      setState('saved')
    } catch (err: unknown) {
      // Roll the toggle back to its previous value so the UI matches the server.
      setPrefs((current) => ({ ...current, [key]: previous }))
      setErrorMessage(err instanceof Error ? err.message : 'Could not save your preferences.')
      setState('error')
    }
  }

  return (
    <div>
      <ul className="flex flex-col gap-4">
        {PREFERENCES.map((pref) => (
          <li key={pref.id} className="flex items-start justify-between gap-4">
            <Label htmlFor={pref.id} className="flex-1 cursor-pointer flex-col items-start gap-0.5">
              <span className="block font-ui text-[15px] font-normal text-cocoa-dark">
                {pref.label}
              </span>
              <span className="block font-sans text-[13px] font-normal text-dusty-gray">
                {pref.desc}
              </span>
            </Label>
            <Switch
              id={pref.id}
              checked={prefs[pref.key]}
              disabled={isSaving}
              onCheckedChange={(checked) => handleToggle(pref.key, checked)}
              className="mt-1"
            />
          </li>
        ))}
      </ul>

      {/* Status region — announces save progress and results to assistive tech. */}
      <output
        aria-live="polite"
        className="mt-5 block min-h-[1.25rem] font-ui text-[12px] motion-safe:transition-colors motion-safe:duration-200"
      >
        {state === 'saving' && <span className="text-dusty-gray">Saving…</span>}
        {state === 'saved' && <span className="text-success">Preferences saved.</span>}
        {state === 'error' && (
          <span className="text-error">
            {errorMessage || 'Could not save your preferences. Please try again.'}
          </span>
        )}
      </output>
    </div>
  )
}
