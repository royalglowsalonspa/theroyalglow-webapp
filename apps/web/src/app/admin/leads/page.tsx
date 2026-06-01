import { LeadKanban } from '@/components/lead/LeadKanban'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Leads',
}

export default function LeadsPage() {
  return <LeadKanban />
}
