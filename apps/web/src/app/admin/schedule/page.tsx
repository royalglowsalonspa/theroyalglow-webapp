import type { Metadata } from 'next'
import { ScheduleGrid } from './schedule-grid'

export const metadata: Metadata = {
  title: 'Schedule',
}

export default function SchedulePage() {
  return <ScheduleGrid />
}
