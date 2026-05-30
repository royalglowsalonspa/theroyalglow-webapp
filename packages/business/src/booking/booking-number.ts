import { customAlphabet } from 'nanoid'

const digits = customAlphabet('0123456789', 5)

export function generateBookingNumber(
  branchCode: string,
  serviceType: 'salon' | 'spa',
  date: Date,
): string {
  const yy = String(date.getFullYear()).slice(-2)
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const typeInitial = serviceType === 'salon' ? 'H' : 'S'
  return `BK-${branchCode}-${yy}${mm}-${typeInitial}-${digits()}`
}
