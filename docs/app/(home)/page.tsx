import { Card, Cards } from 'fumadocs-ui/components/card'
import Link from 'next/link'

export const metadata = {
  title: 'Royal Glow Salon & Spa — Engineering & Product Docs',
  description:
    'The complete documentation for the Royal Glow platform — product, architecture, APIs, data model, operations, and runbooks.',
}

const stats = [
  { label: 'Database tables', value: '38' },
  { label: 'Background jobs', value: '19' },
  { label: 'RBAC roles', value: '6' },
  { label: 'Infra cost / mo', value: '₹0' },
]

const paths = [
  {
    audience: 'New engineer',
    title: 'Get the project running',
    href: '/docs/getting-started',
    blurb: 'Clone, install, and boot all three apps locally in minutes.',
  },
  {
    audience: 'Operator / owner',
    title: 'Understand the business',
    href: '/docs/product/business-overview',
    blurb: 'Plain-language tour of what the platform does and who uses it.',
  },
  {
    audience: 'On-call / ops',
    title: 'Run & recover production',
    href: '/docs/operations',
    blurb: 'Deploys, monitoring, rollback, and the launch runbook.',
  },
]

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-16 px-6 py-20">
      {/* Hero */}
      <section className="flex flex-col items-center gap-6 text-center">
        <span className="rounded-full border border-fd-primary/30 bg-fd-primary/10 px-4 py-1 font-medium text-fd-primary text-sm">
          Royal Glow Salon &amp; Spa · Internal Documentation
        </span>
        <h1 className="bg-gradient-to-br from-fd-foreground to-fd-muted-foreground bg-clip-text font-bold text-4xl text-transparent tracking-tight sm:text-6xl">
          One source of truth for the entire platform
        </h1>
        <p className="max-w-2xl text-balance text-fd-muted-foreground sm:text-lg">
          Architecture, conventions, the agent-friendly API reference, the 38-table data model,
          every background job, and the launch runbook — for engineers, operators, and anyone who
          wants to understand how Royal Glow works.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/docs"
            className="rounded-full bg-fd-primary px-6 py-2.5 font-medium text-fd-primary-foreground text-sm transition-opacity hover:opacity-90"
          >
            Open the docs
          </Link>
          <Link
            href="/docs/project-status"
            className="rounded-full border border-fd-border px-6 py-2.5 font-medium text-fd-foreground text-sm transition-colors hover:bg-fd-accent"
          >
            Project status
          </Link>
        </div>
      </section>

      {/* Stats */}
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-fd-border bg-fd-card p-5 text-center"
          >
            <div className="font-bold text-3xl text-fd-foreground">{s.value}</div>
            <div className="mt-1 text-fd-muted-foreground text-sm">{s.label}</div>
          </div>
        ))}
      </section>

      {/* Choose your path */}
      <section className="flex flex-col gap-5">
        <div className="text-center">
          <h2 className="font-semibold text-2xl text-fd-foreground">Start where you are</h2>
          <p className="mt-1 text-fd-muted-foreground text-sm">
            Three fast on-ramps depending on what you do.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {paths.map((p) => (
            <Link
              key={p.title}
              href={p.href}
              className="group flex flex-col gap-2 rounded-xl border border-fd-border bg-fd-card p-6 transition-colors hover:border-fd-primary/50 hover:bg-fd-accent"
            >
              <span className="font-medium text-fd-primary text-xs uppercase tracking-wide">
                {p.audience}
              </span>
              <span className="font-semibold text-fd-foreground text-lg">{p.title}</span>
              <span className="text-fd-muted-foreground text-sm">{p.blurb}</span>
              <span className="mt-auto pt-2 font-medium text-fd-primary text-sm opacity-0 transition-opacity group-hover:opacity-100">
                Read →
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Explore */}
      <section className="flex flex-col gap-5">
        <div className="text-center">
          <h2 className="font-semibold text-2xl text-fd-foreground">Explore the documentation</h2>
          <p className="mt-1 text-fd-muted-foreground text-sm">
            Every layer of the platform, documented.
          </p>
        </div>
        <Cards>
          <Card
            title="Product"
            href="/docs/product"
            description="What the platform does and who uses it — in plain language."
          />
          <Card
            title="Features"
            href="/docs/features"
            description="Booking, memberships, gems, offers, CRM, billing, and more."
          />
          <Card
            title="Tech Stack"
            href="/docs/tech-stack"
            description="Every technology used and the rationale behind each choice."
          />
          <Card
            title="Architecture"
            href="/docs/architecture"
            description="How the system is structured, hosted, and layered."
          />
          <Card
            title="System Design"
            href="/docs/system-design"
            description="High- and low-level design — diagrams, flows, decisions."
          />
          <Card
            title="API Reference"
            href="/docs/api-reference"
            description="Every endpoint with requests, responses, and error codes."
          />
          <Card
            title="Data Model"
            href="/docs/data-model"
            description="The 38-table database — tables, enums, conventions."
          />
          <Card
            title="Security & Compliance"
            href="/docs/security"
            description="Data protection and India's DPDP Act, end to end."
          />
          <Card
            title="Operations"
            href="/docs/operations"
            description="Running, monitoring, deploying, and recovering the platform."
          />
        </Cards>
      </section>
    </main>
  )
}
