import { useRef, useState } from 'react'
import { signOut } from '@/lib/auth-client'

export function useCustomerSignOut() {
  const [status, setStatus] = useState<'ready' | 'signing-out' | 'error'>('ready')
  const attemptInFlight = useRef(false)

  async function handleSignOut() {
    if (attemptInFlight.current) return
    attemptInFlight.current = true
    setStatus('signing-out')
    try {
      const { data, error } = await signOut()
      if (error || !data?.success) throw new Error('Sign-out failed')
      window.location.href = '/'
    } catch {
      attemptInFlight.current = false
      setStatus('error')
    }
  }

  return { handleSignOut, signingOut: status === 'signing-out', signOutFailed: status === 'error' }
}
