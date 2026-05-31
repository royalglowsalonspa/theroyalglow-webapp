import type { Metadata } from 'next'
import { MembershipDetail } from './membership-detail'

export const metadata: Metadata = {
  title: 'Membership Detail',
}

type PageProps = {
  params: Promise<{ id: string }>
}

export default async function MembershipDetailPage({ params }: PageProps) {
  const { id } = await params
  return <MembershipDetail membershipId={id} />
}
