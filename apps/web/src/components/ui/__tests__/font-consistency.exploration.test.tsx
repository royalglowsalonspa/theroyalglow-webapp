/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 09-06-2026 & Updated - 09-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : font-consistency.exploration
 * Scope        : Testing (Bugfix exploration — font-consistency-fix)
 *
 * Description  : Bug-condition exploration test for the font-consistency-fix
 *                bugfix spec. Renders every text-bearing shadcn/Radix primitive
 *                and a representative ad-hoc UI element and asserts each carries
 *                the `font-ui` utility (Plus Jakarta Sans) demanded by its UI
 *                typographic role.
 *
 *                THIS TEST IS EXPECTED TO FAIL ON UNFIXED CODE. The failure is
 *                the SUCCESS case for an exploration test: it proves the bug —
 *                the primitive cva/cn bases omit `font-ui`, so each primitive
 *                inherits `font-sans` from the body base layer, contradicting
 *                its UI role (Bug_Condition: isBugCondition(X) where role(X)=ui
 *                and resolvedFont(X)=font-sans).
 *
 * Tech Stack   : Vitest, @testing-library/react, fast-check, jsdom
 * Layer        : Testing (Presentation / Component)
 *
 * Validates    : Requirements 1.1, 1.2, 1.3, 1.4, 1.5 (Property 1: Bug Condition)
 *
 * Notes        : Scope is apps/web only. Do NOT fix the code or this test to make
 *                it pass — Task 3 (Tier 1) applies the primitive fix, after which
 *                this same test will pass and validate the fix.
 ************************************************************/

import { cleanup, render } from '@testing-library/react'
import fc from 'fast-check'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { OnboardingForm } from '@/app/(auth)/onboarding/onboarding-form'
import { Accordion, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

// OnboardingForm is a client component that calls useRouter on render; stub the
// App Router so it can render in jsdom without a Next.js router context.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}))

// Radix Switch (used by the onboarding form) reads ResizeObserver on mount,
// which jsdom does not implement. Provide a no-op stub so the surface renders.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}

afterEach(cleanup)

// The complete variant/size space of the Button primitive, mirrored from the
// `buttonVariants` cva in components/ui/button.tsx. The property below renders
// every combination and asserts `font-ui` is present.
const BUTTON_VARIANTS = [
  'default',
  'destructive',
  'outline',
  'secondary',
  'ghost',
  'link',
  'gold',
  'onDark',
] as const
const BUTTON_SIZES = ['default', 'xs', 'sm', 'lg', 'icon', 'icon-xs', 'icon-sm', 'icon-lg'] as const

function classOf(container: HTMLElement, slot: string): string {
  const el = container.querySelector(`[data-slot="${slot}"]`)
  if (!el) throw new Error(`No element with data-slot="${slot}" was rendered`)
  return el.getAttribute('class') ?? ''
}

describe('font-consistency exploration — text-bearing UI primitives carry font-ui', () => {
  it('Button carries font-ui', () => {
    const { container } = render(<Button>Book Now</Button>)
    // EXPECTED FAILURE on unfixed code: base is
    // "inline-flex … text-sm font-medium …" with no font-ui → inherits font-sans.
    expect(container.querySelector('[data-slot="button"]')).toHaveClass('font-ui')
  })

  it('Badge carries font-ui', () => {
    const { container } = render(<Badge>New</Badge>)
    expect(container.querySelector('[data-slot="badge"]')).toHaveClass('font-ui')
  })

  it('Label carries font-ui', () => {
    const { container } = render(<Label htmlFor="x">Full Name</Label>)
    expect(container.querySelector('[data-slot="label"]')).toHaveClass('font-ui')
  })

  it('AccordionTrigger carries font-ui', () => {
    const { container } = render(
      <Accordion type="single" collapsible>
        <AccordionItem value="item-1">
          <AccordionTrigger>Frequently asked question</AccordionTrigger>
        </AccordionItem>
      </Accordion>,
    )
    expect(container.querySelector('[data-slot="accordion-trigger"]')).toHaveClass('font-ui')
  })

  it('Input carries font-ui', () => {
    const { container } = render(<Input aria-label="phone" />)
    expect(container.querySelector('[data-slot="input"]')).toHaveClass('font-ui')
  })

  it('Textarea carries font-ui', () => {
    const { container } = render(<Textarea aria-label="notes" />)
    expect(container.querySelector('[data-slot="textarea"]')).toHaveClass('font-ui')
  })

  it('a migrated-surface eyebrow/meta UI element on the onboarding form carries font-ui', () => {
    // Render the REAL migrated surface (auth/onboarding form) rather than a
    // synthetic node. Its "Consent & Preferences" eyebrow is role=ui and must
    // resolve to font-ui. This tracks the actual onboarding remediation, so it
    // passes once the surface conforms and stays meaningful at the build gate.
    const { getByText } = render(<OnboardingForm userName="Asha" userEmail="asha@example.com" />)
    expect(getByText('Consent & Preferences')).toHaveClass('font-ui')
  })
})

describe('font-consistency exploration — scoped property over Button variant × size', () => {
  it('every Button variant × size combination carries font-ui', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...BUTTON_VARIANTS),
        fc.constantFrom(...BUTTON_SIZES),
        (variant, size) => {
          const { container } = render(
            <Button variant={variant} size={size}>
              Action
            </Button>,
          )
          const cls = classOf(container, 'button')
          cleanup()
          // Structural root cause: the cva base omits font-ui, so this fails
          // uniformly across every variant × size on unfixed code.
          return cls.split(/\s+/).includes('font-ui')
        },
      ),
      { numRuns: 64 },
    )
  })
})
