import type { Metadata } from 'next'
import { LeaveQueue } from './leave-queue'

export const metadata: Metadata = {
  title: 'Leave',
}

export default function LeavePage() {
  return <LeaveQueue />
}
