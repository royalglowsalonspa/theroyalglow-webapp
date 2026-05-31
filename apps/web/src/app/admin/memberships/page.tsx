import type { Metadata } from 'next'
import { MembershipsList } from './memberships-list'

export const metadata: Metadata = {
  title: 'Memberships',
}

export default function MembershipsPage() {
  return <MembershipsList />
}
