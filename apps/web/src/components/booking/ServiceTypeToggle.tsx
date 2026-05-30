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
