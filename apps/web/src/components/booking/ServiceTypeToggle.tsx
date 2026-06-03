/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : ServiceTypeToggle
 * Scope        : Booking UI
 *
 * Description  : Accessible Salon/SPA toggle component using pill-styled
 *                radio buttons. Used in booking and services UI.
 *
 * Responsibilities :
 * - Render a two-option radio group for Salon vs SPA selection
 * - Communicate selection changes via onChange callback
 * - Provide proper ARIA radiogroup semantics
 *
 * Features / Functionality :
 * - Pill-styled toggle with active/inactive visual states
 * - Accessible radiogroup with aria-checked
 * - Motion-safe colour transitions
 *
 * Tech Stack   : React, TypeScript, Tailwind CSS
 * Layer        : Frontend
 *
 * Dependencies : None
 *
 * Notes        : None
 ************************************************************/

'use client'

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
      <button
        type="button"
        // biome-ignore lint/a11y/useSemanticElements: intentional ARIA radiogroup of styled pill buttons; native <input type="radio"> cannot carry this pill styling.
        role="radio"
        aria-checked={value === 'salon'}
        onClick={() => onChange('salon')}
        className={`font-ui text-[12px] uppercase tracking-[0.5px] rounded-full px-5 py-2 motion-safe:transition-colors motion-safe:duration-200 ${
          value === 'salon'
            ? 'bg-royal-gold text-cocoa-dark'
            : 'bg-cloud-gray text-cocoa-dark hover:bg-golden-mist'
        }`}
      >
        Salon
      </button>
      <button
        type="button"
        // biome-ignore lint/a11y/useSemanticElements: intentional ARIA radiogroup of styled pill buttons; native <input type="radio"> cannot carry this pill styling.
        role="radio"
        aria-checked={value === 'spa'}
        onClick={() => onChange('spa')}
        className={`font-ui text-[12px] uppercase tracking-[0.5px] rounded-full px-5 py-2 motion-safe:transition-colors motion-safe:duration-200 ${
          value === 'spa'
            ? 'bg-royal-gold text-cocoa-dark'
            : 'bg-cloud-gray text-cocoa-dark hover:bg-golden-mist'
        }`}
      >
        SPA
      </button>
    </div>
  )
}
