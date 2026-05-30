import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth-server'
import { OnboardingForm } from './onboarding-form'

export const metadata = {
  title: 'Complete Your Profile | Royal Glow Salon & Spa',
  robots: { index: false, follow: false },
}

export default async function OnboardingPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (!session) {
    redirect('/sign-in')
  }

  return (
    <OnboardingForm
      userName={session.user.name}
      userEmail={session.user.email}
    />
  )
}
