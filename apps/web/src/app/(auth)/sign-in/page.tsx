import type { Metadata } from 'next'
import { SignInCard } from './sign-in-card'

export const metadata: Metadata = {
  title: 'Sign In | Royal Glow Salon & Spa',
  robots: { index: false, follow: false },
}

export default function SignInPage() {
  return <SignInCard />
}
