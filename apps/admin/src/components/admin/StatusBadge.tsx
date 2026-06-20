/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : StatusBadge
 * Scope        : Admin UI
 *
 * Description  : Reusable status badge component with colour-coded dot and
 *                label for booking/payment/membership statuses.
 *
 * Responsibilities :
 * - Render colour-coded badge for any status string
 * - Format snake_case status into human-readable label
 * - Fall back to neutral grey for unknown statuses
 *
 * Features / Functionality :
 * - StatusBadge component with configurable status prop
 * - Colour map for pending, confirmed, in_progress, completed, etc.
 * - Automatic status text formatting (snake_case → Title Case)
 *
 * Tech Stack   : React, TypeScript, Tailwind CSS
 * Layer        : Frontend
 *
 * Dependencies : None
 *
 * Notes        : None
 ************************************************************/

const STATUS_CONFIG: Record<string, { bg: string; text: string; dot: string }> = {
  pending: {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    dot: 'bg-amber-500',
  },
  confirmed: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    dot: 'bg-emerald-500',
  },
  in_progress: {
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    dot: 'bg-blue-500',
  },
  completed: {
    bg: 'bg-gray-100',
    text: 'text-gray-600',
    dot: 'bg-gray-400',
  },
  cancelled: {
    bg: 'bg-red-50',
    text: 'text-red-700',
    dot: 'bg-red-500',
  },
  rejected: {
    bg: 'bg-red-50/60',
    text: 'text-red-600',
    dot: 'bg-red-400',
  },
  no_show: {
    bg: 'bg-red-100',
    text: 'text-red-800',
    dot: 'bg-red-700',
  },
}

function formatStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? {
    bg: 'bg-gray-100',
    text: 'text-gray-600',
    dot: 'bg-gray-400',
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium font-ui ${config.bg} ${config.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} aria-hidden="true" />
      {formatStatus(status)}
    </span>
  )
}
