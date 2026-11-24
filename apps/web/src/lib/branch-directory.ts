import {
  branchAddressLines,
  formatTime12h,
  type HoursRow,
  telHref,
  weeklyHoursRows,
} from '@rgss/business'
import { type BranchDirectoryEntry, getBranchDirectory } from '@rgss/db/queries'
import { createLogger } from '@rgss/logger'
import { addDaysISO, istTodayISO } from '@rgss/types'
import { cache } from 'react'
import { BUSINESS } from '@/lib/seo/business'

const logger = createLogger({
  service: 'web:branch-directory',
  environment: process.env.NODE_ENV ?? 'development',
})

export type PublicLocation = {
  id: string | null
  name: string
  addressLines: string[]
  phone: { label: string; href: string } | null
  email: string | null
  directions: string | null
  status: string | null
  hours: HoursRow[] | null
  closures: BranchDirectoryEntry['closures']
}

const FALLBACK_LOCATION: PublicLocation = {
  id: null,
  name: 'Rayasandra',
  addressLines: [BUSINESS.formattedAddress],
  phone: { label: BUSINESS.telephone, href: `tel:${BUSINESS.telephone.replace(/[^\d+]/g, '')}` },
  email: BUSINESS.email,
  directions: BUSINESS.hasMap,
  status: null,
  hours: BUSINESS.openingHours.map(({ days, opens, closes }) => ({
    days: `${days[0]?.slice(0, 3)} – ${days.at(-1)?.slice(0, 3)}`,
    hours: `${formatTime12h(opens)} – ${formatTime12h(closes)}`,
  })),
  closures: [],
}

function toPublicLocation(branch: BranchDirectoryEntry): PublicLocation {
  const phone = telHref(branch.phone)
  const mapsUrl = branch.googleMapsUrl ? URL.parse(branch.googleMapsUrl) : null
  const directions = mapsUrl && ['https:', 'http:'].includes(mapsUrl.protocol) ? mapsUrl.href : null
  const status =
    branch.status === 'temporarily_closed'
      ? ['Temporarily closed', branch.temporaryCloseReason].filter(Boolean).join(' · ')
      : branch.status === 'opens_soon'
        ? 'Opening soon'
        : null
  // The seeded upcoming branch has a placeholder street and phone until its
  // location is final. Show its city without publishing the placeholder.
  const addressLines = /^tbd$/i.test(branch.addressLine1.trim())
    ? branchAddressLines({ addressLine1: '', city: branch.city, state: branch.state })
    : branchAddressLines(branch)

  return {
    id: branch.id,
    name: branch.name,
    addressLines,
    phone: phone ? { label: branch.phone, href: phone } : null,
    email: branch.email,
    directions,
    status,
    hours: branch.businessHours ? weeklyHoursRows(branch.businessHours) : null,
    closures: branch.closures,
  }
}

const CACHE_MS = 5 * 60 * 1000
let cachedDirectory:
  | { date: string; expiresAt: number; read: Promise<PublicLocation[]> }
  | undefined

// Share the read between the page and layout and reuse it briefly across
// requests. Refresh at IST midnight even if the five minutes have not elapsed.
export const loadPublicLocations = cache(async (): Promise<PublicLocation[]> => {
  const date = istTodayISO()
  const now = Date.now()
  if (cachedDirectory?.date === date && cachedDirectory.expiresAt > now) {
    return cachedDirectory.read
  }

  const read = getBranchDirectory(date, addDaysISO(date, 29))
    .then((branches) => branches.map(toPublicLocation))
    .catch(() => {
      if (cachedDirectory?.read === read) cachedDirectory = undefined
      logger.warn('Could not load the public branch directory')
      return [FALLBACK_LOCATION]
    })
  cachedDirectory = { date, expiresAt: now + CACHE_MS, read }
  return read
})
