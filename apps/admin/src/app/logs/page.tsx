import type { Metadata } from 'next'
import { LogsTable } from './logs-table'

export const metadata: Metadata = { title: 'Logs' }

export default function LogsPage() {
  return <LogsTable />
}
