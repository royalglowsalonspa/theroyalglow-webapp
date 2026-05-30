'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
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
