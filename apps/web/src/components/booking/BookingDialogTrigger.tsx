/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : BookingDialogTrigger
 * Scope        : Booking UI
 *
 * Description  : Listens for ?book=1 search param and auto-opens the booking
 *                dialog. Supports deep-linking from homepage CTAs and external ads.
 *
 * Responsibilities :
 * - Watch URL search params for book=1 flag
 * - Auto-open booking dialog when flag is present
 * - Render no visible UI
 *
 * Features / Functionality :
 * - Deep-link support: /?book=1, /?book=1&utm_source=gmb
 * - Reactive to search param changes via useSearchParams
 *
 * Tech Stack   : React, TypeScript, Next.js
 * Layer        : Frontend
 *
 * Dependencies : next/navigation, ./BookingDialogProvider
 *
 * Notes        : None
 ************************************************************/

'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect } from 'react'
import { useBookingDialog } from './BookingDialogProvider'

export function BookingDialogTrigger() {
  const searchParams = useSearchParams()
  const { open } = useBookingDialog()

  useEffect(() => {
    if (searchParams.get('book') === '1') {
      open()
    }
  }, [searchParams, open])

  return null
}
