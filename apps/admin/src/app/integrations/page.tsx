import type { Metadata } from 'next'
import { CatalogueSyncPanel } from './catalogue-sync-panel'
import { IntegrationsStatus } from './integrations-status'

export const metadata: Metadata = { title: 'Integrations' }

export default function IntegrationsPage() {
  return (
    <div className="space-y-10">
      <IntegrationsStatus />
      <CatalogueSyncPanel />
    </div>
  )
}
