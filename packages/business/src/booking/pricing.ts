export function calculateBookingTotal(
  services: { pricePaise: number; durationMinutes: number }[],
): {
  totalAmountPaise: number
  totalDurationMinutes: number
} {
  return {
    totalAmountPaise: services.reduce((sum, s) => sum + s.pricePaise, 0),
    totalDurationMinutes: services.reduce((sum, s) => sum + s.durationMinutes, 0),
  }
}

export function addMinutesToTime(time: string, minutes: number): string {
  const [h = 0, m = 0] = time.split(':').map(Number)
  const total = h * 60 + m + minutes
  const nh = Math.floor(total / 60) % 24
  const nm = total % 60
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`
}
