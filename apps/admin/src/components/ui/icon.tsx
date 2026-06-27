/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : icon
 * Scope        : Admin — Icon System / App Shell, Sidebar, Dashboard
 *
 * Description  : Thin presentation wrapper around a `lucide-react` icon that
 *                enforces the redesign's accessibility contract for icons. A
 *                decorative icon sitting beside a visible text label is hidden
 *                from assistive technology; an icon that is the sole content of
 *                a control exposes a required, non-empty accessible name.
 *
 * Responsibilities :
 * - Render the supplied `lucide-react` icon component at a token-driven size
 * - Hide decorative icons from AT via `aria-hidden="true"` (Req 2.4)
 * - Expose labelled icons as `role="img"` with a required `aria-label` (Req 2.5)
 *
 * Features / Functionality :
 * - DEFAULT_ICON_SIZE constant (18)
 * - Icon — accessibility-enforcing wrapper over any LucideIcon
 * - Discriminated props: `decorative` icons forbid `label`; labelled icons
 *   require a non-empty `label` (compile-time a11y enforcement)
 *
 * Tech Stack   : TypeScript, React 19, lucide-react
 * Layer        : Presentation (UI component, no I/O, no business logic)
 *
 ************************************************************/

import { cn } from '@rgss/ui/lib/utils'
import type { LucideIcon } from 'lucide-react'

/**
 * Default icon edge size (pixels) used when no `size` is supplied. Icons are
 * coloured via `currentColor`, inheriting the surrounding text colour token.
 */
export const DEFAULT_ICON_SIZE = 18

/**
 * Props shared by both decorative and labelled icons.
 */
type IconBaseProps = {
  /** The `lucide-react` icon component to render. */
  icon: LucideIcon
  /** Edge size in pixels (defaults to {@link DEFAULT_ICON_SIZE}). */
  size?: number
  /** Token-driven class names; merged via `cn`. Colour uses `currentColor`. */
  className?: string
}

/**
 * A decorative icon rendered alongside a visible text label. It is hidden from
 * assistive technology and must not carry a label (the visible text is the
 * accessible content). (Req 2.4)
 */
type DecorativeIconProps = IconBaseProps & {
  decorative: true
  label?: never
}

/**
 * An icon that is the only content of an interactive control. It requires a
 * non-empty accessible label naming the control's action. (Req 2.5)
 */
type LabelledIconProps = IconBaseProps & {
  decorative?: false
  label: string
}

/**
 * Icon props discriminated on `decorative`: decorative icons forbid a `label`,
 * while non-decorative (labelled) icons require one.
 */
export type IconProps = DecorativeIconProps | LabelledIconProps

/**
 * Accessibility-enforcing wrapper around a `lucide-react` icon.
 *
 * - When `decorative` is `true`, the icon is marked `aria-hidden="true"` and
 *   removed from the tab/focus order, so screen readers ignore it (Req 2.4).
 * - Otherwise the icon is exposed as `role="img"` with the required
 *   `aria-label`, naming the control's action for assistive technology
 *   (Req 2.5).
 *
 * Presentation-only: no I/O, no business logic.
 *
 * @param props - {@link IconProps}
 * @returns The rendered icon element.
 */
export function Icon({
  icon: IconComponent,
  decorative,
  label,
  size = DEFAULT_ICON_SIZE,
  className,
}: IconProps) {
  if (decorative) {
    return (
      <IconComponent aria-hidden="true" className={cn(className)} focusable={false} size={size} />
    )
  }

  return <IconComponent aria-label={label} className={cn(className)} role="img" size={size} />
}
