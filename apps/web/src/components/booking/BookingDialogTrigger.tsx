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
