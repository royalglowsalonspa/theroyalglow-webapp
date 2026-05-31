import type { Metadata } from 'next'
import { LeadDetail } from '@/components/lead/LeadDetail'

export const metadata: Metadata = {
  title: 'Lead Detail',
}

type PageProps = {
  params: Promise<{ id: string }>
}

export default async function LeadDetailPage({ params }: PageProps) {
  const { id } = await params
  return <LeadDetail leadId={id} />
}
