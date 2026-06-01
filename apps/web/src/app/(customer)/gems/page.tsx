import { auth } from '@/lib/auth-server'
import { formatDateIN, formatINR } from '@rgss/business'
import {
  getLoyaltySummary,
  getLoyaltyTransactions,
  getOrCreateLoyaltyAccount,
  getRedeemableServices,
} from '@rgss/db/queries'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

export const metadata: Metadata = {
  title: 'My Gems',
  description: 'Track your Royal Glow loyalty gems, history and rewards.',
  robots: { index: false, follow: false },
}

const PAGE_SIZE = 20

type PageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

// Earned/adjusted gems add to the balance; redeemed/expired remove from it.
const TX_META: Record<string, { label: string; sign: '+' | '-'; tone: string }> = {
  earned: { label: 'Earned', sign: '+', tone: 'text-emerald-700' },
  redeemed: { label: 'Redeemed', sign: '-', tone: 'text-deep-gold' },
  expired: { label: 'Expired', sign: '-', tone: 'text-dusty-gray' },
  adjusted: { label: 'Adjusted', sign: '+', tone: 'text-cocoa-dark' },
}

function parsePage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value
  const parsed = Number(raw)
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : 1
}

function toDate(value: Date | string | null): Date | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export default async function GemsPage({ searchParams }: PageProps) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    redirect('/sign-in')
  }

  const customerId = session.user.id
  const { page: pageParam } = await searchParams
  const page = parsePage(pageParam)
  const offset = (page - 1) * PAGE_SIZE

  // Ensure an account exists so a first-time customer sees zeros, not an error.
  await getOrCreateLoyaltyAccount(customerId)

  const [summary, transactions, redeemable] = await Promise.all([
    getLoyaltySummary(customerId),
    getLoyaltyTransactions(customerId, PAGE_SIZE, offset),
    getRedeemableServices(),
  ])

  const balance = summary ?? { balance: 0, totalEarned: 0, totalRedeemed: 0 }
  const hasPrev = page > 1
  const hasNext = transactions.length === PAGE_SIZE

  return (
    <div className="mx-auto max-w-[800px] px-5 py-10 lg:py-14">
      <header className="mb-8">
        <p className="font-ui text-[11px] uppercase tracking-[2px] text-warm-stone mb-2">
          Your rewards
        </p>
        <h1 className="font-display text-[clamp(32px,5vw,48px)] text-cocoa-dark tracking-tight leading-[1.05]">
          My Gems
        </h1>
      </header>

      {/* Balance hero */}
      <section
        className="rounded-[6px] border border-cloud-gray bg-canvas-white p-6 mb-6"
        aria-labelledby="gems-balance-heading"
      >
        <h2 id="gems-balance-heading" className="sr-only">
          Gems balance
        </h2>
        <div className="flex items-baseline gap-2 mb-6">
          <span
            className="font-display text-[clamp(40px,8vw,64px)] text-cocoa-dark leading-none"
            aria-label={`${balance.balance} gems available`}
          >
            {balance.balance.toLocaleString('en-IN')}
          </span>
          <span className="font-ui text-[13px] uppercase tracking-[1px] text-deep-gold">gems</span>
        </div>

        <dl className="grid grid-cols-2 gap-4">
          <div className="rounded-[6px] bg-warm-cream px-4 py-3">
            <dt className="font-ui text-[11px] uppercase tracking-[1px] text-warm-stone mb-1">
              Lifetime earned
            </dt>
            <dd className="font-display text-[22px] text-cocoa-dark">
              {balance.totalEarned.toLocaleString('en-IN')}
            </dd>
          </div>
          <div className="rounded-[6px] bg-warm-cream px-4 py-3">
            <dt className="font-ui text-[11px] uppercase tracking-[1px] text-warm-stone mb-1">
              Lifetime redeemed
            </dt>
            <dd className="font-display text-[22px] text-cocoa-dark">
              {balance.totalRedeemed.toLocaleString('en-IN')}
            </dd>
          </div>
        </dl>
      </section>

      {/* Redeemable catalogue */}
      <section className="mb-6" aria-labelledby="gems-catalogue-heading">
        <h2
          id="gems-catalogue-heading"
          className="font-display text-[20px] text-cocoa-dark tracking-tight mb-1"
        >
          Redeem your gems
        </h2>
        <p className="font-sans text-[13px] text-dusty-gray mb-5">
          Redeem at your next visit — ask our team at the counter. No online redemption.
        </p>

        {redeemable.length === 0 ? (
          <p className="font-sans text-[15px] text-dusty-gray py-4">
            No rewards are available right now. Check back soon.
          </p>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {redeemable.map((item) => {
              const affordable = item.gemsRequired != null && balance.balance >= item.gemsRequired
              return (
                <li key={item.id}>
                  <article className="h-full rounded-[6px] border border-cloud-gray bg-canvas-white p-5 motion-safe:transition-all duration-200 hover:border-golden-mist hover:shadow-card-hover">
                    <h3 className="font-sans text-[16px] text-cocoa-dark mb-2">{item.name}</h3>
                    <p className="font-ui text-[14px] text-deep-gold mb-1">
                      {item.gemsRequired != null
                        ? `${item.gemsRequired.toLocaleString('en-IN')} gems`
                        : 'Ask in store'}
                    </p>
                    <p className="font-sans text-[12px] text-dusty-gray mb-3">
                      Worth {formatINR(item.pricePaise)}
                    </p>
                    <p
                      className={`font-ui text-[11px] uppercase tracking-[0.5px] ${
                        affordable ? 'text-emerald-700' : 'text-warm-stone'
                      }`}
                    >
                      {affordable ? 'Ready to redeem' : 'Redeem at your next visit'}
                    </p>
                  </article>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* Transaction history */}
      <section className="mb-6" aria-labelledby="gems-history-heading">
        <h2
          id="gems-history-heading"
          className="font-display text-[20px] text-cocoa-dark tracking-tight mb-4"
        >
          Gems history
        </h2>

        {transactions.length === 0 ? (
          <p className="font-sans text-[15px] text-dusty-gray py-4">
            No gems activity yet. Earn gems on your next visit.
          </p>
        ) : (
          <ul className="space-y-3">
            {transactions.map((tx) => {
              const meta = TX_META[tx.type] ?? {
                label: tx.type,
                sign: '+' as const,
                tone: 'text-cocoa-dark',
              }
              const createdAt = toDate(tx.createdAt)
              const expiresAt = toDate(tx.expiresAt)
              return (
                <li key={tx.id}>
                  <article className="flex items-center justify-between gap-3 rounded-[6px] border border-cloud-gray bg-canvas-white px-4 py-3">
                    <div className="min-w-0">
                      <p className="font-sans text-[15px] text-cocoa-dark">
                        {tx.description ?? meta.label}
                      </p>
                      <p className="font-sans text-[12px] text-dusty-gray">
                        {createdAt ? (
                          <time dateTime={createdAt.toISOString().slice(0, 10)}>
                            {formatDateIN(createdAt)}
                          </time>
                        ) : (
                          '—'
                        )}
                        {tx.invoiceNumber ? ` · ${tx.invoiceNumber}` : ''}
                        {tx.type === 'earned' && expiresAt
                          ? ` · expires ${formatDateIN(expiresAt)}`
                          : ''}
                      </p>
                    </div>
                    <span className={`font-ui text-[15px] whitespace-nowrap ${meta.tone}`}>
                      {meta.sign}
                      {Math.abs(tx.gemsAmount).toLocaleString('en-IN')}
                    </span>
                  </article>
                </li>
              )
            })}
          </ul>
        )}

        {(hasPrev || hasNext) && (
          <nav
            className="flex items-center justify-between gap-3 mt-5"
            aria-label="Gems history pagination"
          >
            {hasPrev ? (
              <a
                href={`/gems?page=${page - 1}`}
                className="font-ui text-[12px] uppercase tracking-[0.5px] rounded-full px-5 py-2 border border-cloud-gray text-cocoa-dark hover:border-golden-mist motion-safe:transition-colors duration-200"
              >
                ← Newer
              </a>
            ) : (
              <span aria-hidden="true" />
            )}
            <span className="font-sans text-[13px] text-dusty-gray">Page {page}</span>
            {hasNext ? (
              <a
                href={`/gems?page=${page + 1}`}
                className="font-ui text-[12px] uppercase tracking-[0.5px] rounded-full px-5 py-2 border border-cloud-gray text-cocoa-dark hover:border-golden-mist motion-safe:transition-colors duration-200"
              >
                Older →
              </a>
            ) : (
              <span aria-hidden="true" />
            )}
          </nav>
        )}
      </section>

      {/* Explainer */}
      <section className="rounded-[6px] border border-cloud-gray bg-warm-cream px-5 py-4">
        <p className="font-sans text-[13px] text-warm-gray">
          <span className="font-ui text-deep-gold">How gems work · </span>
          Earn 1 gem per ₹100 spent on salon services. Gems expire 365 days after they are earned,
          so redeem them on your next visit.
        </p>
      </section>
    </div>
  )
}
