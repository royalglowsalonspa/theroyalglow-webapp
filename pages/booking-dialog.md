# Booking Dialog (4-Step Overlay)

> The booking dialog is a multi-step overlay component that appears on the homepage. It is NOT a separate route — it's triggered by `/?book=1` or the "Book Now" button anywhere on the site.

---

| Property | Detail |
|----------|--------|
| **Trigger** | "Book Now" button on homepage / `/?book=1` deep-link / service card "Book This" button |
| **Mobile UX** | Bottom sheet (slides up from bottom, draggable handle, full height on expand) |
| **Desktop UX** | Centered modal (max-width 600px, backdrop blur, click-outside to close) |
| **Animations** | motion.dev (Framer Motion): slide-up on mobile, scale-in on desktop, step transitions as horizontal slide |
| **Accessibility** | `role="dialog"`, `aria-modal="true"`, focus trapped inside, Escape to close, focus returned to trigger on close |

---

## Step 1 — Branch + Date + Time Slot

- Branch selector: hidden in Phase 1 (auto-selects Rayasandra); future: radio cards
- Name + Email: prefilled from profile (read-only display, not editable)
- Gender: prefilled, editable (select dropdown)
- Date picker: calendar UI, future dates only, holidays/closures greyed out with tooltip
- Time slot grid: available slots as tappable chips, fully-booked slots greyed out with "Full" label
- Slot updates: `aria-live="polite"` announces availability changes

---

## Step 2 — Choose Categories

- Salon / SPA toggle: segmented control (one booking = one type only)
- Category cards: multi-select with checkmarks, icon per category
- Cannot proceed without at least one category selected
- Validation: "Select at least one category" inline error

---

## Step 3 — Choose Services

- Services filtered by selected categories
- SPA 60/90min variants: single card with inline duration toggle
- Multi-select with running total at bottom: "3 services · ₹3,500.00 · ~90 min"
- "Add more" prompt if only 1 service selected (non-blocking)
- Cannot proceed without at least one service selected

---

## Step 4 — Summary & Confirmation

- "Booking Submitted!" status badge (green)
- Selected services list with individual prices
- Total: `₹X,XXX.00` with "Inclusive of 18% GST" label
- Payment note: "Pay at the salon (Cash / UPI / Card)"
- Gems info: "You have X gems — Browse Gems Catalogue →"
- Actions: "Go to Home" | "View My Bookings"
- Confetti animation on successful submit (subtle, motion.dev)

---

## Error States Per Step

- Step 1: "Please select a date and time" / "This slot is no longer available" (real-time conflict)
- Step 3: "Please select at least one service"
- Submit failure: "Something went wrong. Please try again." with retry button

---

## Analytics Events

- PostHog: `booking_started` (dialog open), `booking_step_completed` (each step), `booking_request_submitted` (final), `booking_abandoned` (dialog closed before step 4)
- Meta Pixel: `InitiateCheckout` (dialog open)
