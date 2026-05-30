import { Suspense } from 'react'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { BookingDialogProvider } from '@/components/booking/BookingDialogProvider'
import { BookingDialogTrigger } from '@/components/booking/BookingDialogTrigger'

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return (
    <BookingDialogProvider>
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:bg-royal-gold focus:text-cocoa-dark focus:font-ui focus:text-xs focus:uppercase focus:tracking-[0.5px] focus:rounded-full focus:px-4 focus:py-2">
        Skip to content
      </a>

      {/* Announcement Bar */}
      <div className="bg-cocoa-dark text-canvas-white text-center font-sans text-xs py-2 px-4">
        <span className="font-ui text-royal-gold">NEW</span>
        {' · '}
        Monsoon Glow offers — up to 30% off signature rituals
        {' '}
        <a href="/offers" className="underline underline-offset-2 hover:text-royal-gold transition-colors duration-200">→</a>
      </div>

      <Header />
      <main id="main-content" className="pt-16 lg:pt-[72px]">
        {children}
      </main>
      <Footer />
      <Suspense fallback={null}>
        <BookingDialogTrigger />
      </Suspense>
    </BookingDialogProvider>
  )
}
