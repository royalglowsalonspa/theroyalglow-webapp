// Gems are earned at 1 gem per ₹100 invoiced (floor). ₹100 = 10000 paise.
// Only applies to invoice_type = 'service' — never membership purchases/sessions
// (the caller enforces that; this is pure arithmetic).
export function calculateGemsEarned(totalPaise: number): number {
  return Math.floor(totalPaise / 10000)
}
