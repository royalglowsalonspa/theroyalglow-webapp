import type { Metadata } from 'next'
import { CreateMembershipForm } from './create-membership-form'

export const metadata: Metadata = {
  title: 'Create Membership',
}

export default function NewMembershipPage() {
  return <CreateMembershipForm />
}
