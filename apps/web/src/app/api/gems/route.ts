import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireSession } from '@/lib/api/session'
import {
  getLoyaltySummary,
  getLoyaltyTransactions,
  getOrCreateLoyaltyAccount,
  getRedeemableServices,
} from '@rgss/db/queries'

const DEFAULT_PAGE = 1
const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100

// Parse a positive integer query param, falling back to a default and clamping
// to a maximum where supplied. Invalid/missing values use the default.
function parsePositiveInt(
  value: string | null,
  fallback: number,
  max?: number,
): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback
  }
  return max ? Math.min(parsed, max) : parsed
}

// GET /api/gems — the caller's own loyalty balance, paginated transaction
// history, and the redeemable-services catalogue. Strictly scoped to the
// authenticated customer (session.user.id); never exposes another user's data.
export const GET = withErrorHandler(async (req: Request) => {
  const session = await requireSession()
  const customerId = session.user.id

  const url = new URL(req.url)
  const page = parsePositiveInt(url.searchParams.get('page'), DEFAULT_PAGE)
  const pageSize = parsePositiveInt(
    url.searchParams.get('pageSize'),
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
  )
  const offset = (page - 1) * pageSize

  // Ensure an account exists so a brand-new customer sees zeros, not an error.
  await getOrCreateLoyaltyAccount(customerId)

  const [summary, transactions, redeemable] = await Promise.all([
    getLoyaltySummary(customerId),
    getLoyaltyTransactions(customerId, pageSize, offset),
    getRedeemableServices(),
  ])

  const balance = summary ?? { balance: 0, totalEarned: 0, totalRedeemed: 0 }

  // No separate count query: if a full page came back there may be more, so
  // totalPages is at least page + 1; otherwise this is the last page.
  const hasMore = transactions.length === pageSize
  const totalPages = hasMore ? page + 1 : page

  return apiSuccess(
    { summary: balance, transactions, redeemable },
    { page, totalPages },
  )
})
