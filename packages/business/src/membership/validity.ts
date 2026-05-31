const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000

// Membership expiry = start date + validityDays, set to end-of-day IST.
// Pure and deterministic: shift the instant into IST wall-clock, advance the
// calendar day count, pin to 23:59:59.999 IST, then convert back to a UTC instant.
// Strictly after startDate for validityDays >= 1 and monotonic in validityDays.
export function computeExpiry(startDate: Date, validityDays: number): Date {
  const istWall = new Date(startDate.getTime() + IST_OFFSET_MS)
  istWall.setUTCDate(istWall.getUTCDate() + validityDays)
  istWall.setUTCHours(23, 59, 59, 999)
  return new Date(istWall.getTime() - IST_OFFSET_MS)
}
