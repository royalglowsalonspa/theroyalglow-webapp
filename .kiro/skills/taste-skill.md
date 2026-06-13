---
name: design-taste-frontend
description: Anti-slop frontend skill for landing pages, portfolios, and redesigns. The agent reads the brief, infers the right design direction, and ships interfaces that do not look templated. Real design systems when applicable, audit-first on redesigns, strict pre-flight check.
---

# tasteskill: Anti-Slop Frontend Skill

> Landing pages, portfolios, and redesigns. Not dashboards, not data tables, not multi-step product UI.
> Every rule below is **contextual**. None of it fires automatically. First read the brief, then pull only what fits.

---

## 0. BRIEF INFERENCE (Read the Room Before Anything Else)

Before touching code or tweaking dials, **infer what the user actually wants**. Most LLM design output is bad because the model jumps to a default aesthetic instead of reading the room.

### 0.A Read these signals first
1. **Page kind** - landing (SaaS / consumer / agency / event), portfolio (dev / designer / creative studio), redesign (preserve vs overhaul), editorial / blog.
2. **Vibe words** the user used - "minimalist", "calm", "Linear-style", "Awwwards", "brutalist", "premium consumer", "Apple-y", "playful", "serious B2B", "editorial", "agency-y", "glassy", "dark tech".
3. **Reference signals** - URLs they linked, screenshots they pasted, products they named, brands they're competing with.
4. **Audience** - B2B procurement panel vs. design-conscious consumer vs. recruiter scanning a portfolio. The audience picks the aesthetic, not your taste.
5. **Brand assets that already exist** - logo, color, type, photography. For redesigns, these are starting material, not optional input.
6. **Quiet constraints** - accessibility-first audiences, public-sector, regulated industries, trust-first commerce, kids' products. These constraints OVERRIDE aesthetic preference.

### 0.B Output a one-line "Design Read" before generating
Before any code, state in one line: **"Reading this as: <page kind> for <audience>, with a <vibe> language, leaning toward <design system or aesthetic family>."**

### 0.C If the brief is ambiguous, ask one question, do not guess

### 0.D Anti-Default Discipline
Do not default to: AI-purple gradients, centered hero over dark mesh, three equal feature cards, generic glassmorphism on everything, infinite-loop micro-animations everywhere, Inter + slate-900. These are the LLM defaults. Reach past them deliberately based on the design read.

---

## 1. THE THREE DIALS (Core Configuration)

* **`DESIGN_VARIANCE: 8`** - 1 = Perfect Symmetry, 10 = Artsy Chaos
* **`MOTION_INTENSITY: 6`** - 1 = Static, 10 = Cinematic / Physics
* **`VISUAL_DENSITY: 4`** - 1 = Art Gallery / Airy, 10 = Cockpit / Packed Data

### Dial Inference Table
| Signal | VARIANCE | MOTION | DENSITY |
|---|---|---|---|
| "minimalist / clean / calm / editorial / Linear-style" | 5-6 | 3-4 | 2-3 |
| "premium consumer / Apple-y / luxury / brand" | 7-8 | 5-7 | 3-4 |
| "playful / wild / Dribbble / Awwwards / experimental / agency" | 9-10 | 8-10 | 3-4 |
| "landing page / portfolio / marketing site (default)" | 7-9 | 6-8 | 3-5 |
| "trust-first / public-sector / regulated / accessibility-critical" | 3-4 | 2-3 | 4-5 |

---

## 2. DESIGN ENGINEERING DIRECTIVES

### Typography
* Display / Headlines: `text-4xl md:text-6xl tracking-tighter leading-none`
* Body: `text-base text-gray-600 leading-relaxed max-w-[65ch]`
* Discouraged as default: `Inter`. Pick `Geist`, `Outfit`, `Cabinet Grotesk`, `Satoshi` first.
* SERIF DISCIPLINE: Serif is very discouraged as default. Only when brief explicitly names a serif or aesthetic is genuinely editorial/luxury/heritage.
* Banned as defaults: `Fraunces` and `Instrument_Serif`

### Color Calibration
* Max 1 accent color. Saturation < 80% by default.
* THE LILA RULE: No automatic purple button glows, no random neon gradients.
* COLOR CONSISTENCY LOCK: Once an accent color is chosen, it is used on the WHOLE page.
* PREMIUM-CONSUMER PALETTE BAN: No default beige/cream + brass/clay/oxblood/ochre for premium briefs.

### Layout Diversification
* ANTI-CENTER BIAS: Centered Hero avoided when `DESIGN_VARIANCE > 4`. Force asymmetric layouts.
* Hero MUST fit in the initial viewport. Headline max 2 lines, subtext max 20 words.
* Navigation MUST render on a single line on desktop. Height cap: 80px max.
* Section-Layout-Repetition Ban: Once you use a layout family, it can appear at most ONCE on the page.
* ZIGZAG ALTERNATION CAP: Max 2 consecutive image+text-split sections.
* EYEBROW RESTRAINT: Maximum 1 eyebrow per 3 sections.

### Cards & Materiality
* Use cards ONLY when elevation communicates real hierarchy.
* Tint shadows to the background hue. No pure-black drop shadows on light backgrounds.
* SHAPE CONSISTENCY LOCK: Pick ONE corner-radius scale and stick to it.

### Interactive UI States
* Always implement: Loading (skeletal), Empty States, Error States, Tactile Feedback
* BUTTON CONTRAST CHECK: WCAG AA min (4.5:1 for body, 3:1 for large text)
* CTA BUTTON WRAP BAN: Button text MUST fit on one line at desktop.
* NO DUPLICATE CTA INTENT: One label per intent on a page.

---

## 3. MOTION RULES

* Animate ONLY `transform` and `opacity`. Never animate `top`, `left`, `width`, `height`.
* MOTION MUST BE MOTIVATED: Each animation needs a clear purpose (hierarchy, storytelling, feedback, state transition).
* MARQUEE MAX-ONE-PER-PAGE.
* No `window.addEventListener('scroll')` - use Motion `useScroll()` / ScrollTrigger / IntersectionObserver.
* Any motion above `MOTION_INTENSITY > 3` MUST honor `prefers-reduced-motion`.

---

## 4. AI TELLS (Forbidden Patterns)

* NO neon / outer glows by default
* NO pure black (`#000000`). Use off-black, zinc-950.
* NO 3-column equal feature cards
* NO generic names (John Doe, Sarah Chan)
* NO startup-slop brand names (Acme, Nexus, SmartFlow)
* NO filler verbs (Elevate, Seamless, Unleash, Next-Gen)
* NO hand-rolled SVG icons - use Phosphor / HugeIcons / Radix / Tabler
* NO div-based fake screenshots
* EM-DASH (`---`) is COMPLETELY banned. Use regular hyphen or restructure.
* NO version labels in hero (V0.6, BETA) unless brief is a launch
* NO section-numbering eyebrows (001, 002)
* NO scroll cues (Scroll, arrow-scroll, Scroll to explore)
* NO locale/weather strips unless genuinely place-focused

---

## 5. PERFORMANCE & ACCESSIBILITY

* Hardware acceleration: Only `transform` and `opacity`
* Reduced motion: mandatory for `MOTION_INTENSITY > 3`
* Dark mode: Design for both modes from the start
* Core Web Vitals: LCP < 2.5s, INP < 200ms, CLS < 0.1
* `min-h-[100dvh]` never `h-screen` for full-height sections
* Grid over Flex-Math: Use CSS Grid, not complex flexbox percentage math

---

## 6. PRE-FLIGHT CHECK (Run before outputting code)

- [ ] Brief inference declared?
- [ ] ZERO em-dashes anywhere on the page?
- [ ] Page Theme Lock: ONE theme for the whole page?
- [ ] Color Consistency Lock: one accent across all sections?
- [ ] Button Contrast Check: every CTA readable (WCAG AA)?
- [ ] Hero fits viewport: headline <= 2 lines, subtext <= 20 words?
- [ ] Navigation on ONE line at desktop, height <= 80px?
- [ ] No AI Tells from Section 4?
- [ ] Reduced motion wrapped for everything MOTION_INTENSITY > 3?
- [ ] Dark mode tokens defined?
- [ ] Mobile collapse explicit for high-variance layouts?
- [ ] Real images used (not div-based fake screenshots)?
- [ ] Core Web Vitals plausibly hit?
