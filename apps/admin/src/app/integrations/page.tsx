import type { Metadata } from 'next'
import { IntegrationsStatus } from './integrations-status'

export const metadata: Metadata = { title: 'Integrations' }

export default function IntegrationsPage() {
  return <IntegrationsStatus />
}
