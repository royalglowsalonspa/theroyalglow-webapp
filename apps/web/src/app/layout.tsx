import type { Metadata } from 'next'
import '@/styles/globals.css'

export const metadata: Metadata = {
  title: 'Royal Glow Salon & SPA',
  description:
    'A premium salon and spa experience in Bengaluru. Book appointments, explore services, and indulge in luxury beauty treatments.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
