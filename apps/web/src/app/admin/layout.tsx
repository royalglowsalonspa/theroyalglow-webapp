import type { Metadata } from 'next'
import { AdminShell } from './admin-shell'

export const metadata: Metadata = {
  title: {
    template: '%s | Admin | Royal Glow',
    default: 'Admin | Royal Glow',
  },
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <AdminShell>{children}</AdminShell>
}
