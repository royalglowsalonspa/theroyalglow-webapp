// Distraction-free landing chrome for conversion-optimised pages (e.g. /book).
// No header, footer, or navigation — the only exit path is the page's own CTA.
export default function LandingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-golden-mist via-warm-cream to-canvas-white px-4 py-8">
      <div className="w-full max-w-[480px]">{children}</div>
    </div>
  )
}
