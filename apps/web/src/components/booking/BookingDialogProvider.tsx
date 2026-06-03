/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : BookingDialogProvider
 * Scope        : Booking UI
 *
 * Description  : React context provider for the booking dialog open/close state.
 *                Wraps the app so any component can trigger the booking flow.
 *
 * Responsibilities :
 * - Provide open/close/isOpen context for the booking dialog
 * - Render the BookingDialog component alongside children
 * - Export useBookingDialog hook for consuming components
 *
 * Features / Functionality :
 * - BookingDialogProvider — context wrapper with dialog instance
 * - useBookingDialog() — hook returning { open, close, isOpen }
 *
 * Tech Stack   : React, TypeScript
 * Layer        : Frontend
 *
 * Dependencies : ./BookingDialog
 *
 * Notes        : None
 ************************************************************/

'use client'

import { type ReactNode, createContext, useCallback, useContext, useState } from 'react'
import { BookingDialog } from './BookingDialog'

interface BookingDialogContextType {
  open: () => void
  close: () => void
  isOpen: boolean
}

const BookingDialogContext = createContext<BookingDialogContextType>({
  open: () => {},
  close: () => {},
  isOpen: false,
})

export function BookingDialogProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])

  return (
    <BookingDialogContext.Provider value={{ open, close, isOpen }}>
      {children}
      <BookingDialog isOpen={isOpen} onClose={close} />
    </BookingDialogContext.Provider>
  )
}

export function useBookingDialog() {
  return useContext(BookingDialogContext)
}
