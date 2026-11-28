import type { SplitCheckoutTenders } from '@rgss/types'
import { formatINR } from '../utils/currency'

const tenderLabels = { cash: 'Cash', upi: 'UPI', card: 'Card' } as const

export function formatSplitPayment(tenders: SplitCheckoutTenders, amount = formatINR): string {
  return tenders
    .map(({ method, amountPaise }) => `${tenderLabels[method]} ${amount(amountPaise)}`)
    .join(' + ')
}
