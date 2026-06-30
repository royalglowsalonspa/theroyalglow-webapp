/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 08-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : ServiceTypeToggle
 * Scope        : Booking UI
 *
 * Description  : Accessible Salon/SPA toggle component using pill-styled
 *                radio buttons built on the shadcn/ui Button primitive. Used in
 *                booking and services UI.
 *
 * Responsibilities :
 * - Render a two-option radio group for Salon vs SPA selection
 * - Communicate selection changes via onChange callback
 * - Provide proper ARIA radiogroup semantics
 *
 * Features / Functionality :
 * - Pill-styled toggle with active/inactive visual states
 * - Accessible radiogroup with aria-checked
 *
 * Tech Stack   : React, TypeScript, Tailwind CSS, shadcn/ui
 * Layer        : Frontend
 *
 * Dependencies : @/components/ui/button
 *
 * Notes        : None
 ************************************************************/

'use client'

import { Button } from '@/components/ui/button'

type ServiceType = 'salon' | 'spa'

interface ServiceTypeToggleProps {
  value: ServiceType
  onChange: (type: ServiceType) => void
}

export function ServiceTypeToggle({ value, onChange }: ServiceTypeToggleProps) {
  return (
    <div
      className="inline-flex gap-1 rounded-full bg-cloud-gray p-1"
      role="radiogroup"
      aria-label="Service type"
    >
      {(['salon', 'spa'] as const).map((t) => (
        <Button
          key={t}
          type="button"
          // biome-ignore lint/a11y/useSemanticElements: intentional ARIA radiogroup of styled pill buttons; native <input type="radio"> cannot carry this pill styling.
          role="radio"
          aria-checked={value === t}
          variant={value === t ? 'gold' : 'ghost'}
          size="sm"
          onClick={() => onChange(t)}
          className={`rounded-full font-ui text-[12px] uppercase tracking-[0.5px] ${
            value === t ? '' : 'text-cocoa-dark hover:bg-golden-mist'
          }`}
        >
          {t === 'spa' ? 'SPA' : 'Salon'}
        </Button>
      ))}
    </div>
  )
}
