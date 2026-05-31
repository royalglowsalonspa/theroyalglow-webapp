import type { Metadata } from 'next'
import { LeadKanban } from '@/components/lead/LeadKanban'

export const metadata: Metadata = {
  title: 'Leads',
}

export default function LeadsPage() {
  return <LeadKanban />
}
