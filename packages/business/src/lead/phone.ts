// Normalise an Indian mobile number to the canonical +91XXXXXXXXXX form used for
// storage and deduplication. Strips every non-digit character, keeps the last
// ten digits (dropping any leading 91 / 0 country/trunk prefix), and re-applies
// the +91 prefix. Idempotent: normalising an already-canonical value is a no-op.
export function normaliseIndianPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  const last10 = digits.slice(-10)
  return `+91${last10}`
}
