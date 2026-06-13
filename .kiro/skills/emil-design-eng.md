---
name: emil-design-eng
description: Emil Kowalski's philosophy on UI polish, component design, animation decisions, and the invisible details that make software feel great.
---

# Design Engineering (Emil Kowalski)

## Core Philosophy

- **Taste is trained, not innate.** Good taste is a trained instinct - the ability to see beyond the obvious. Study why the best interfaces feel the way they do.
- **Unseen details compound.** Most details users never consciously notice. That is the point. The aggregate of invisible correctness creates interfaces people love without knowing why.
- **Beauty is leverage.** People select tools based on the overall experience. Good defaults and good animations are real differentiators.

## The Animation Decision Framework

### 1. Should this animate at all?

| Frequency | Decision |
|---|---|
| 100+ times/day (keyboard shortcuts, command palette) | No animation. Ever. |
| Tens of times/day (hover effects, list navigation) | Remove or drastically reduce |
| Occasional (modals, drawers, toasts) | Standard animation |
| Rare/first-time (onboarding, celebrations) | Can add delight |

**Never animate keyboard-initiated actions.**

### 2. What easing should it use?

- Element entering or exiting -> ease-out (starts fast, feels responsive)
- Moving/morphing on screen -> ease-in-out
- Hover/color change -> ease
- Constant motion (marquee, progress) -> linear
- **Never use ease-in for UI animations.** It starts slow, feels sluggish.

Custom easing curves (recommended):
```css
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);
--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
```

### 3. How fast should it be?

| Element | Duration |
|---|---|
| Button press feedback | 100-160ms |
| Tooltips, small popovers | 125-200ms |
| Dropdowns, selects | 150-250ms |
| Modals, drawers | 200-500ms |

**Rule: UI animations should stay under 300ms.**

## Component Building Principles

### Buttons must feel responsive
```css
.button { transition: transform 160ms ease-out; }
.button:active { transform: scale(0.97); }
```

### Never animate from scale(0)
Start from `scale(0.95)` or higher, combined with opacity. Nothing in real world appears from nowhere.

### Make popovers origin-aware
Popovers should scale from their trigger, not from center.
```css
.popover { transform-origin: var(--radix-popover-content-transform-origin); }
```
Exception: modals keep `transform-origin: center`.

### Tooltips: skip delay on subsequent hovers
Once one tooltip is open, adjacent tooltips open instantly with no animation.

### Use CSS transitions over keyframes for interruptible UI
CSS transitions can be interrupted and retargeted mid-animation. Keyframes restart from zero.

### Use blur to mask imperfect transitions
Add subtle `filter: blur(2px)` during crossfade transitions. Keep under 20px.

## Performance Rules

- Only animate `transform` and `opacity` (skip layout and paint)
- CSS variables are inheritable - updating on parent recalculates all children
- Framer Motion shorthand (`x`, `y`, `scale`) is NOT hardware-accelerated. Use full `transform` string for GPU acceleration.
- CSS animations beat JS under load (run off main thread)
- Use WAAPI for programmatic CSS animations with JS control

## Accessibility

### prefers-reduced-motion
Keep opacity and color transitions. Remove movement and position animations.
```css
@media (prefers-reduced-motion: reduce) {
  .element { animation: fade 0.2s ease; }
}
```

### Touch device hover states
```css
@media (hover: hover) and (pointer: fine) {
  .element:hover { transform: scale(1.05); }
}
```

## Review Checklist

| Issue | Fix |
|---|---|
| `transition: all` | Specify exact properties |
| `scale(0)` entry | Start from `scale(0.95)` with `opacity: 0` |
| `ease-in` on UI element | Switch to `ease-out` or custom curve |
| `transform-origin: center` on popover | Set to trigger location (modals exempt) |
| Animation on keyboard action | Remove animation entirely |
| Duration > 300ms on UI element | Reduce to 150-250ms |
| Hover animation without media query | Add `@media (hover: hover) and (pointer: fine)` |
| Keyframes on rapidly-triggered element | Use CSS transitions |
| Same enter/exit speed | Make exit faster than enter |
| Elements all appear at once | Add stagger delay (30-80ms between items) |

## Stagger Animations

```css
.item { opacity: 0; transform: translateY(8px); animation: fadeIn 300ms ease-out forwards; }
.item:nth-child(1) { animation-delay: 0ms; }
.item:nth-child(2) { animation-delay: 50ms; }
.item:nth-child(3) { animation-delay: 100ms; }
```

Keep stagger delays short (30-80ms). Never block interaction while stagger plays.

## Spring Animations

Use springs for:
- Drag interactions with momentum
- Elements that should feel "alive"
- Gestures that can be interrupted mid-animation
- Decorative mouse-tracking interactions

Springs maintain velocity when interrupted - CSS animations restart from zero.

## Asymmetric Enter/Exit Timing

Pressing should be slow when deliberate (hold-to-delete: 2s linear), but release should always be snappy (200ms ease-out). Slow where user decides, fast where system responds.
