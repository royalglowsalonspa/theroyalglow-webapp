import type { Metadata } from 'next'
import { StaffLeavePanel } from './staff-leave-panel'

export const metadata: Metadata = {
  title: 'My Leave',
  description: 'Request leave and review your leave history at Royal Glow.',
}

export default function StaffLeavePage() {
  return (
    <div>
      <header className="mb-8">
        <p className="font-ui text-[11px] uppercase tracking-[2px] text-warm-stone mb-2">
          Time off
        </p>
        <h1 className="font-display text-[clamp(28px,5vw,40px)] text-cocoa-dark tracking-tight leading-[1.05]">
          My Leave
        </h1>
      </header>

      <StaffLeavePanel />
    </div>
  )
}
