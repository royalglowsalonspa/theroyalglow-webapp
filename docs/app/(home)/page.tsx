import Link from 'next/link'

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="font-bold text-3xl">Royal Glow Salon &amp; Spa — Docs</h1>
      <p className="max-w-prose text-fd-muted-foreground">
        Engineering documentation for the Royal Glow platform — architecture, conventions, and the
        agent-friendly API reference.
      </p>
      <Link
        href="/docs"
        className="rounded-full bg-fd-primary px-6 py-2.5 font-medium text-fd-primary-foreground text-sm"
      >
        Open the docs
      </Link>
    </main>
  )
}
