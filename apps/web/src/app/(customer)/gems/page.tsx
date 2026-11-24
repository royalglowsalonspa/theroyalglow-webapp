/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 31-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : GemsPage
 * Scope        : Loyalty Programme
 *
 * Description  : Customer loyalty (gems) dashboard showing balance, redeemable
 *                catalogue, and paginated transaction history. Rebuilt on the
 *                shadcn/ui Card + Button primitives with the shared font system.
 *
 * Responsibilities :
 * - Display the customer's current gems balance and lifetime stats
 * - Render the redeemable services catalogue with affordability status
 * - Show paginated transaction history with type/date/amount details
 *
 * Features / Functionality :
 * - Auto-creates loyalty account for first-time visitors
 * - Colour-coded transaction types (earned, redeemed, returned, expired,
 *   adjusted)
 * - Server-side pagination with prev/next navigation
 *
 * Tech Stack   : React, Next.js 16 (App Router), Tailwind CSS v4, shadcn/ui,
 *                Better Auth, Drizzle ORM
 * Layer        : Presentation
 *
 * Dependencies : auth, formatDateIN, loyalty queries, RedeemFlow,
 *                @/components/ui/{card,button}, @/lib/gems-history
 *
 * Notes        :
 * - Protected route; redirects to / (homepage) if no session
 ************************************************************/

import { buildPublicBranchList, computeAffordability, formatDateIN } from '@rgss/business'
import {
  getLoyaltySummary,
  getLoyaltyTransactions,
  getOrCreateLoyaltyAccount,
  getPublicBranches,
  getRedeemableServices,
} from '@rgss/db/queries'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { RedeemFlow } from '@/components/gems/RedeemFlow'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { auth } from '@/lib/auth-server'
import { describeGemsTx } from '@/lib/gems-history'

export const metadata: Metadata = {
  title: 'My Gems',
  description: 'Track your Royal Glow loyalty gems, history and rewards.',
  robots: { index: false, follow: false },
}

const PAGE_SIZE = 20

type PageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
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
    redirect('/')
  }

  const customerId = session.user.id
  const { page: pageParam } = await searchParams
  const page = parsePage(pageParam)
  const offset = (page - 1) * PAGE_SIZE

  // Ensure an account exists so a first-time customer sees zeros, not an error.
  await getOrCreateLoyaltyAccount(customerId)

  const [summary, transactions, redeemable, branches] = await Promise.all([
    getLoyaltySummary(customerId),
    getLoyaltyTransactions(customerId, PAGE_SIZE, offset),
    getRedeemableServices(),
    getPublicBranches(),
  ])
  // The customer redeems at the branch they choose (multi-branch R7.2).
  const branchList = buildPublicBranchList(branches)

  const balance = summary ?? { balance: 0, totalEarned: 0, totalRedeemed: 0 }
  const hasPrev = page > 1
  const hasNext = transactions.length === PAGE_SIZE

  // Drop services without a gem price (Req 1.3), then flag affordability (Req 2)
  // so the client RedeemFlow renders the catalogue without any business logic.
  const catalogue = computeAffordability(
    balance.balance,
    redeemable.filter((item) => item.gemsRequired != null),
  ).map((item) => ({
    id: item.id,
    name: item.name,
    gemsRequired: item.gemsRequired as number,
    pricePaise: item.pricePaise,
    affordable: item.affordable,
    availableBranchIds: item.availableBranchIds,
  }))

  return (
    <div className="mx-auto max-w-[800px] px-5 py-10 lg:py-14">
      <header className="mb-8">
        <p className="mb-2 font-ui text-[11px] uppercase tracking-[2px] text-warm-stone">
          Your rewards
        </p>
        <h1 className="font-display font-black text-[clamp(32px,5vw,48px)] leading-[1.05] tracking-tight text-cocoa-dark">
          My Gems
        </h1>
      </header>

      {/* Balance hero */}
      <Card className="mb-6 gap-6 p-6" aria-labelledby="gems-balance-heading">
        <h2 id="gems-balance-heading" className="sr-only">
          Gems balance
        </h2>
        <div className="flex items-baseline gap-2">
          {/* No aria-label: it is not exposed on a roleless span, and the visible
              "{n} gems" pairing under the "Gems balance" heading already reads
              correctly to assistive tech. */}
          <span className="font-display text-[clamp(40px,8vw,64px)] leading-none text-cocoa-dark">
            {balance.balance.toLocaleString('en-IN')}
          </span>
          <span className="font-ui text-[13px] uppercase tracking-[1px] text-gold-ink">gems</span>
        </div>

        <dl className="grid grid-cols-2 gap-4">
          <div className="rounded-[6px] bg-warm-cream px-4 py-3">
            <dt className="mb-1 font-ui text-[11px] uppercase tracking-[1px] text-warm-stone">
              Lifetime earned
            </dt>
            <dd className="font-display text-[22px] text-cocoa-dark">
              {balance.totalEarned.toLocaleString('en-IN')}
            </dd>
          </div>
          <div className="rounded-[6px] bg-warm-cream px-4 py-3">
            <dt className="mb-1 font-ui text-[11px] uppercase tracking-[1px] text-warm-stone">
              Lifetime redeemed
            </dt>
            <dd className="font-display text-[22px] text-cocoa-dark">
              {balance.totalRedeemed.toLocaleString('en-IN')}
            </dd>
          </div>
        </dl>
      </Card>

      {/* Redeemable catalogue */}
      <section className="mb-6" aria-labelledby="gems-catalogue-heading">
        <h2
          id="gems-catalogue-heading"
          className="mb-1 font-display text-[20px] tracking-tight text-cocoa-dark"
        >
          Redeem your gems
        </h2>
        <p className="mb-5 font-sans text-[13px] text-dusty-gray">
          Spend your gems on a reward service — pick a date and time, and we'll confirm your
          appointment. Each reward is fully covered by gems.
        </p>

        <RedeemFlow balance={balance.balance} catalogue={catalogue} branchList={branchList} />
      </section>

      {/* Transaction history */}
      <section className="mb-6" aria-labelledby="gems-history-heading">
        <h2
          id="gems-history-heading"
          className="mb-4 font-display text-[20px] tracking-tight text-cocoa-dark"
        >
          Gems history
        </h2>

        {transactions.length === 0 ? (
          <p className="py-4 font-sans text-[15px] text-dusty-gray">
            No gems activity yet. Earn gems on your next visit.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {transactions.map((tx) => {
              const line = describeGemsTx(tx)
              const createdAt = toDate(tx.createdAt)
              const expiresAt = toDate(tx.expiresAt)
              return (
                <li key={tx.id}>
                  <Card className="flex-row items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="font-sans text-[15px] text-cocoa-dark">{line.text}</p>
                      <p className="font-ui text-[12px] text-dusty-gray">
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
                    <span className={`whitespace-nowrap font-ui text-[15px] ${line.tone}`}>
                      {line.sign}
                      {line.gems.toLocaleString('en-IN')}
                    </span>
                  </Card>
                </li>
              )
            })}
          </ul>
        )}

        {(hasPrev || hasNext) && (
          <nav
            className="mt-5 flex items-center justify-between gap-3"
            aria-label="Gems history pagination"
          >
            {hasPrev ? (
              <Button
                asChild
                variant="outline"
                size="sm"
                className="rounded-full font-ui text-xs uppercase tracking-[0.5px]"
              >
                <Link href={`/gems?page=${page - 1}`}>
                  <ArrowLeft data-icon="inline-start" aria-hidden="true" />
                  Newer
                </Link>
              </Button>
            ) : (
              <span aria-hidden="true" />
            )}
            <span className="font-ui text-[13px] text-dusty-gray">Page {page}</span>
            {hasNext ? (
              <Button
                asChild
                variant="outline"
                size="sm"
                className="rounded-full font-ui text-xs uppercase tracking-[0.5px]"
              >
                <Link href={`/gems?page=${page + 1}`}>
                  Older
                  <ArrowRight data-icon="inline-end" aria-hidden="true" />
                </Link>
              </Button>
            ) : (
              <span aria-hidden="true" />
            )}
          </nav>
        )}
      </section>

      {/* Explainer */}
      <Card className="bg-warm-cream px-5 py-4">
        <p className="font-sans text-[13px] text-warm-gray">
          <span className="font-ui text-gold-ink">How gems work · </span>
          Earn 1 gem per ₹100 spent on salon services. Gems expire 365 days after they are earned,
          so redeem them on your next visit.
        </p>
      </Card>
    </div>
  )
}
