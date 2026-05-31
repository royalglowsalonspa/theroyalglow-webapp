// Shared types + formatting helpers for the admin lead pipeline pages.
// Mirrors the GET /api/admin/leads (list) and /api/admin/leads/[id] (detail)
// responses, which both use the standard { success, data } envelope.

export type LeadStatus =
  | 'new'
  | 'contacted'
  | 'follow_up'
  | 'booked'
  | 'won'
  | 'lost'

// A row returned by GET /api/admin/leads — a flattened lead joined with its
// service-interest name, plus the server-computed pipeline helpers. Timestamps
// arrive as ISO strings over the wire.
export interface LeadPipelineRow {
  id: string
  name: string
  phone: string
  email: string | null
  serviceInterestedId: string | null
  serviceName: string | null
  status: LeadStatus
  source: string
  utmCampaign: string | null
  utmMedium: string | null
  utmSource: string | null
  utmContent: string | null
  utmTerm: string | null
  assignedTo: string | null
  convertedBookingId: string | null
  lastContactedAt: string | null
  createdAt: string
  updatedAt: string
  daysSinceCapture: number
  isStale: boolean
}

export interface LeadNoteRow {
  id: string
  leadId: string
  content: string
  authorId: string
  authorName: string | null
  createdAt: string
}

// The linked converted booking (only the fields the detail page renders).
export interface ConvertedBookingRef {
  id: string
  bookingNumber: string
  status: string
}

// The shape returned by GET /api/admin/leads/[id]: the lead row joined with its
// service name, assigned-to name, converted booking, plus its notes.
export interface LeadDetailData {
  id: string
  name: string
  phone: string
  email: string | null
  serviceInterestedId: string | null
  serviceName: string | null
  assignedToName: string | null
  status: LeadStatus
  source: string
  utmCampaign: string | null
  utmMedium: string | null
  utmSource: string | null
  utmContent: string | null
  utmTerm: string | null
  assignedTo: string | null
  convertedBookingId: string | null
  convertedBooking: ConvertedBookingRef | null
  lastContactedAt: string | null
  createdAt: string
  updatedAt: string
  notes: LeadNoteRow[]
}

// Presentation metadata per status (label + Tailwind classes for the badge).
export const LEAD_STATUS_META: Record<
  LeadStatus,
  { label: string; badge: string; dot: string }
> = {
  new: { label: 'New', badge: 'bg-blue-50 text-blue-700', dot: 'bg-blue-500' },
  contacted: {
    label: 'Contacted',
    badge: 'bg-amber-50 text-amber-700',
    dot: 'bg-amber-500',
  },
  follow_up: {
    label: 'Follow-up',
    badge: 'bg-violet-50 text-violet-700',
    dot: 'bg-violet-500',
  },
  booked: {
    label: 'Booked',
    badge: 'bg-emerald-50 text-emerald-700',
    dot: 'bg-emerald-500',
  },
  won: {
    label: 'Won',
    badge: 'bg-emerald-100 text-emerald-800',
    dot: 'bg-emerald-600',
  },
  lost: { label: 'Lost', badge: 'bg-red-50 text-red-700', dot: 'bg-red-500' },
}

// Mirrors ALLOWED_LEAD_TRANSITIONS in @rgss/business so the detail page only
// offers valid moves. The server re-validates every transition.
export const ALLOWED_LEAD_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  new: ['contacted', 'lost'],
  contacted: ['follow_up', 'booked', 'lost'],
  follow_up: ['booked', 'lost'],
  booked: ['won', 'lost'],
  won: [],
  lost: [],
}

export const LEAD_TRANSITION_LABEL: Record<LeadStatus, string> = {
  new: 'Mark New',
  contacted: 'Mark Contacted',
  follow_up: 'Mark Follow-up',
  booked: 'Mark Booked',
  won: 'Mark Won',
  lost: 'Mark Lost',
}

// The five visible kanban columns. The final column combines won + lost.
export const LEAD_COLUMNS: {
  key: string
  label: string
  statuses: LeadStatus[]
}[] = [
  { key: 'new', label: 'New', statuses: ['new'] },
  { key: 'contacted', label: 'Contacted', statuses: ['contacted'] },
  { key: 'follow_up', label: 'Follow-up', statuses: ['follow_up'] },
  { key: 'booked', label: 'Booked', statuses: ['booked'] },
  { key: 'closed', label: 'Won / Lost', statuses: ['won', 'lost'] },
]

// "2026-05-22T14:15:00.000Z" → "22/05/2026" (IST, DD/MM/YYYY).
export function formatLeadDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) {
    return iso
  }
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(d)
}

// "2026-05-22T14:15:00.000Z" → "22 May 2026, 02:15 PM" (IST) for the timeline.
export function formatLeadDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) {
    return iso
  }
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  }).format(d)
}

// "Xd ago" from the server-computed daysSinceCapture.
export function formatDaysSince(days: number): string {
  if (days <= 0) {
    return 'Today'
  }
  return `${days}d ago`
}

// Build a wa.me-compatible number (country code + digits, no '+') from a stored
// phone. Stored phones are normalised to +91XXXXXXXXXX.
export function toWhatsAppNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) {
    return `91${digits}`
  }
  return digits
}

// The campaign label shown on a card: utm_campaign if present, else the source.
export function leadCampaignLabel(
  lead: Pick<LeadPipelineRow, 'utmCampaign' | 'utmSource' | 'source'>,
): string {
  if (lead.utmCampaign) {
    return lead.utmSource ? `${lead.utmSource}/${lead.utmCampaign}` : lead.utmCampaign
  }
  return lead.source
}
