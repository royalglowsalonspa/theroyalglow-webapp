# Testing Strategy — RGSS Production Quality Engineering

> **Author:** Principal Test Engineer  
> **Philosophy:** Ship fast, break nothing. Every line of code earns its place through proof.  
> **Standard:** FAANG-grade quality gates — the system must be provably correct before reaching customers.

---

## Table of Contents

1. [Testing Philosophy](#testing-philosophy)
2. [Testing Layers & Tools](#testing-layers--tools)
3. [Tool Arsenal — Rating & Verdicts](#tool-arsenal--rating--verdicts)
4. [Static Analysis — Biome + Ultracite](#static-analysis--biome--ultracite)
5. [AI-Powered Testing Tools](#ai-powered-testing-tools)
6. [Unit Testing (Vitest)](#unit-testing-vitest)
7. [Integration Testing (Vitest + Real DB)](#integration-testing-vitest--real-db)
8. [Component Testing (Vitest + React Testing Library)](#component-testing-vitest--react-testing-library)
9. [End-to-End Testing (Playwright)](#end-to-end-testing-playwright)
10. [Performance Testing](#performance-testing)
11. [Load & Stress Testing (k6)](#load--stress-testing-k6)
12. [Security Testing](#security-testing)
13. [Contract Testing (API Schema Validation)](#contract-testing-api-schema-validation)
14. [Chaos & Resilience Testing](#chaos--resilience-testing)
15. [Mocking Strategy (MSW + Vitest)](#mocking-strategy-msw--vitest)
16. [Test Data Management](#test-data-management)
17. [CI Pipeline Integration](#ci-pipeline-integration)
18. [Pre-Commit Hooks & Local Quality Gates](#pre-commit-hooks--local-quality-gates)
19. [Mutation Testing (Quarterly Audit)](#mutation-testing-quarterly-audit)
20. [Test Environments & Data](#test-environments--data)
21. [Flaky Test Management](#flaky-test-management)
22. [Coverage Requirements](#coverage-requirements)
23. [Test Naming & Organization Conventions](#test-naming--organization-conventions)
24. [Snapshot Testing Policy](#snapshot-testing-policy)
25. [Reporting & Observability](#reporting--observability)
26. [File Structure](#file-structure)
27. [Commands](#commands)
28. [Testing Checklist (Per Feature)](#testing-checklist-per-feature)
29. [Tool Cost Summary](#tool-cost-summary)
30. [Testing Strategy Decision Log](#testing-strategy-decision-log)

---

## Testing Philosophy

### The Testing Diamond (Not Pyramid)

Traditional testing pyramid (many unit, fewer integration, few E2E) doesn't fit modern fullstack apps where the **integration boundary** is where most bugs live. RGSS uses a **testing diamond**:

```
          ┌─────┐
         │ E2E  │ ← Critical paths only (golden path verification)
        ┌┴───────┴┐
       │Integration│ ← MOST tests live here (API + DB + services)
        └┬───────┬┘
         │ Unit  │ ← Pure logic only (no mocking infrastructure)
          └─────┘
         ┌───────┐
        │AI-Powered│ ← Autonomous regression detection (Meticulous)
         └───────┘
```

### Core Principles

1. **Tests are production code** — same code quality, same review rigor, same TypeScript strictness
2. **Test behavior, not implementation** — if you refactor and tests break, the tests were wrong
3. **Deterministic or nothing** — flaky tests get quarantined immediately, fixed within 24h, or deleted
4. **Fast feedback loop** — unit tests < 10s, integration < 60s, E2E < 5 min (local)
5. **AI augments, humans verify** — use AI tools to generate and maintain tests, but engineer owns correctness
6. **Shift-left security** — security testing runs on every PR, not just before release

---

## Testing Layers & Tools

| Layer | Tool | Scope | When | Hard Gate? |
|-------|------|-------|------|-----------|
| Static Analysis | **TypeScript 5.8** strict mode | Type safety across codebase | Every save (IDE) | ✅ CI blocks |
| Linting + Format | **Biome + Ultracite** | Code style, bugs, a11y, imports | Every save | ✅ CI blocks |
| Unit | **Vitest** | Pure functions, business logic, utilities | Every PR | ✅ CI blocks |
| Integration | **Vitest** + Neon test branch | API routes, DB queries, service layer | Every PR to `test+` | ✅ CI blocks |
| Component | **Vitest** + React Testing Library | UI components in isolation | Every PR | ✅ CI blocks |
| End-to-End | **Playwright** | Critical user journeys in real browsers | Every PR to `test+` | ✅ CI blocks |
| Visual Regression | **Meticulous AI** | Pixel-perfect UI diff on every PR | Every PR | ⚠️ Warn (review) |
| Autonomous E2E | **TestSprite** | AI-generated exploratory testing | Nightly on `pprd` | ⚠️ Report only |
| Accessibility | **axe-core** + Lighthouse | WCAG 2.1 AA compliance | Every PR | ✅ CI blocks |
| Performance | **Lighthouse CI** | Core Web Vitals, PageSpeed | Every PR to `test+` | ✅ CI blocks |
| Load & Stress | **k6** | Concurrent user simulation | PR to `pprd+` | ✅ CI blocks |
| Security (SAST) | **Trivy** + **Semgrep** | Dependency vulns + code patterns | Every PR | ✅ CI blocks |
| Security (DAST) | **OWASP ZAP** | Runtime vulnerability scan | PR to `pprd+` | ✅ CI blocks |
| Contract | **Zod schemas** | API request/response validation | Runtime + tests | ✅ CI blocks |
| Mutation | **Stryker** (quarterly) | Test suite effectiveness | Quarterly audit | 📊 Report only |
| Chaos/Resilience | Manual + scripts | External service failure handling | Pre-release | 📊 Report only |
| Synthetic Monitoring | **BetterStack** + **Checkly** | Production health + API monitoring | Always (prod) | 🚨 Alert |

---

## Tool Arsenal — Rating & Verdicts

### Rating Criteria

Each tool rated on: **Value** (how much it helps RGSS), **Cost** (free tier viability), **Maintenance** (effort to keep running), **Maturity** (production readiness).

Scale: 1–10 (10 = essential for RGSS).

### Core Testing Tools (MUST HAVE — Non-Negotiable)

| Tool | Category | Rating | Free? | Verdict | Why |
|------|----------|--------|-------|---------|-----|
| **Vitest** | Unit + Integration | 10/10 | ✅ OSS | ✅ KEEP | Fastest test runner for Bun/TS. No alternative comes close. |
| **Playwright** | E2E | 10/10 | ✅ OSS | ✅ KEEP | Multi-browser, fast, first-class TS. Cypress is inferior for Next.js. |
| **Biome + Ultracite** | Lint + Format | 10/10 | ✅ OSS | ✅ KEEP | Replaces ESLint+Prettier. 100x faster. Ultracite = zero-config strict preset. |
| **TypeScript** (strict) | Static Analysis | 10/10 | ✅ OSS | ✅ KEEP | Catches 40% of bugs before tests run. Non-negotiable. |
| **Zod** | Schema Validation | 9/10 | ✅ OSS | ✅ KEEP | Single source of truth for API contracts. Runtime + compile-time safety. |
| **React Testing Library** | Component | 8/10 | ✅ OSS | ✅ KEEP | Tests components as users use them. Encourages a11y-first patterns. |
| **MSW (Mock Service Worker)** | API Mocking | 9/10 | ✅ OSS | ✅ ADD | Network-level mocking for external services. Better than manual vi.mock(). |

### Performance & Load Tools (MUST HAVE)

| Tool | Category | Rating | Free? | Verdict | Why |
|------|----------|--------|-------|---------|-----|
| **Lighthouse CI** | Performance Budget | 9/10 | ✅ OSS | ✅ KEEP | Hard gates on Core Web Vitals. Proven, stable, well-maintained. |
| **Unlighthouse** | Full-Site Audit | 8/10 | ✅ OSS | ✅ ADD | Scans EVERY route (not just 5 pages). Catches performance drift on forgotten pages. |
| **k6** | Load Testing | 9/10 | ✅ OSS | ✅ KEEP | Best load testing tool. JavaScript scripts, great reporting. Local runs free. |
| **@next/bundle-analyzer** | Bundle Size | 7/10 | ✅ OSS | ✅ ADD | Visual treemap of JS bundles. Catches accidental large imports. |

### Security Tools (MUST HAVE)

| Tool | Category | Rating | Free? | Verdict | Why |
|------|----------|--------|-------|---------|-----|
| **Trivy** | Dependency Scan | 9/10 | ✅ OSS | ✅ KEEP | Comprehensive CVE database. Catches known vulnerabilities. |
| **Semgrep** | SAST (Code Patterns) | 9/10 | ✅ Free tier | ✅ KEEP | Custom rules for Next.js, SQL injection, XSS patterns. Community rules free. |
| **OWASP ZAP** | DAST (Runtime Scan) | 8/10 | ✅ OSS | ✅ KEEP | Industry standard. Finds XSS, CSRF, injection at runtime. |
| **Socket.dev** | Supply Chain | 8/10 | ✅ Free tier | ✅ ADD | Detects malicious npm packages (typosquatting, exfiltration). Trivy misses these. |

### AI-Powered Tools (SHOULD HAVE — Evaluated)

| Tool | Category | Rating | Free? | Verdict | Why |
|------|----------|--------|-------|---------|-----|
| **Meticulous AI** | Visual Regression | 8/10 | ✅ Free (<5 devs) | ✅ KEEP | Zero-maintenance visual testing. Records real sessions, replays on PRs. No test code needed. |
| **TestSprite** | Autonomous E2E | 6/10 | ⚠️ Limited free | ⚠️ CONDITIONAL | Good for exploratory testing but RGSS has limited UI surface. Keep on free tier, drop if quota is too restrictive. |
| **Jules (GitHub)** | Test Generation | 5/10 | ✅ Free (GitHub) | ⚠️ USE SPARINGLY | Generates boilerplate. But AI-written tests need heavy review. Use for negative/edge cases only. Don't depend on it. |
| **Checkly** | Synthetic Monitoring | 8/10 | ✅ Free tier (5 checks) | ✅ ADD | Playwright-based synthetic checks in production. Catches issues BetterStack's HTTP pings miss. |

### Tools EVALUATED & REJECTED

| Tool | Category | Rating | Why Rejected |
|------|----------|--------|-------------|
| **Cypress** | E2E | 4/10 | Slower than Playwright. No WebKit. Worse Next.js App Router support. Paid dashboard. |
| **Jest** | Unit | 3/10 | Vitest is drop-in replacement, 10x faster with Bun. No reason to use Jest. |
| **Chromatic** | Visual (Storybook) | 5/10 | Requires Storybook. RGSS doesn't use Storybook — overkill for one-dev team. |
| **Argos CI** | Visual Regression | 6/10 | Good tool but Meticulous is zero-effort (no screenshot code). Argos requires manual screenshot setup. |
| **Percy (BrowserStack)** | Visual Regression | 5/10 | Expensive. Free tier too limited. Meticulous is better for RGSS. |
| **Snyk** | Security | 6/10 | Good but Trivy + Socket.dev covers same ground for free. Snyk nags for upgrade. |
| **Codecov** | Coverage Tracking | 7/10 | Nice PR comments. But Vitest coverage + GH Actions artifact is sufficient. Add later if needed. |
| **Grafana k6 Cloud** | Load Testing Cloud | 5/10 | Local k6 is enough for RGSS scale. Cloud adds cost for minimal benefit. |
| **PagerDuty** | Alerting | 3/10 | BetterStack + Checkly covers monitoring. PagerDuty is for 50+ engineer teams. |
| **Datadog** | Observability | 4/10 | Massively expensive. BetterStack + Sentry + PostHog covers all our needs at $0. |

### Final Tool Stack Decision

```
LOCKED-IN TESTING STACK:
═══════════════════════════════════════════════════════════
STATIC:     TypeScript strict + Biome + Ultracite
UNIT:       Vitest + @faker-js/faker
COMPONENT:  Vitest + React Testing Library + MSW
INTEGRATION:Vitest + Neon test branch + MSW
E2E:        Playwright (5 browsers) + axe-core
VISUAL:     Meticulous AI (zero-effort, session replay)
PERF:       Lighthouse CI + Unlighthouse + @next/bundle-analyzer
LOAD:       k6 (local execution)
SECURITY:   Trivy + Semgrep + OWASP ZAP + Socket.dev
MONITORING: BetterStack (uptime) + Checkly (synthetic) + Sentry (errors)
MUTATION:   Stryker (quarterly)
AI ASSIST:  Meticulous (primary) + TestSprite (nightly, conditional)
CI:         GitHub Actions (free for public/small repos)
═══════════════════════════════════════════════════════════
TOTAL COST: $0/month (all free tiers)
```

---

## Static Analysis — Biome + Ultracite

### Why Biome (Not ESLint + Prettier)

| Criteria | ESLint + Prettier | Biome | Winner |
|----------|-------------------|-------|--------|
| Speed | ~3-5s on full project | ~50ms on full project | **Biome** (100x faster) |
| Config complexity | `.eslintrc` + `.prettierrc` + plugins | `biome.json` (single file) | **Biome** |
| TypeScript support | Via `@typescript-eslint` (slow) | Native (built in Rust) | **Biome** |
| Import sorting | Requires plugin | Built-in | **Biome** |
| Format + Lint | Two tools, two passes | Single tool, single pass | **Biome** |
| Bun compatibility | Some plugins break | Works perfectly | **Biome** |

### Why Ultracite (On Top of Biome)

**Ultracite** is an opinionated Biome configuration preset by Hayden Bleasel that provides:

- **Zero-config strict setup** — no time spent bikeshedding rules
- **Next.js optimized rules** — catches common Next.js mistakes
- **React strict mode** — enforces hooks rules, accessibility patterns
- **Import organization** — automatic sorting, unused import detection
- **TypeScript strict** — works alongside `tsconfig.json` strict mode
- **Tailwind CSS ordering** — consistent utility class order (Biome built-in)

### Configuration

```json
// biome.json (root)
{
  "$schema": "https://biomejs.dev/schemas/2.0/schema.json",
  "extends": ["ultracite"],
  "organizeImports": {
    "enabled": true
  },
  "linter": {
    "rules": {
      "recommended": true,
      "complexity": {
        "noExcessiveCognitiveComplexity": {
          "level": "warn",
          "options": { "maxAllowedComplexity": 15 }
        }
      },
      "correctness": {
        "noUnusedVariables": "error",
        "noUnusedImports": "error",
        "useExhaustiveDependencies": "warn"
      },
      "security": {
        "noDangerouslySetInnerHtml": "error"
      },
      "suspicious": {
        "noExplicitAny": "error",
        "noConsoleLog": "warn"
      },
      "a11y": {
        "useButtonType": "error",
        "useAltText": "error",
        "noAriaUnsupportedElements": "error"
      }
    }
  },
  "formatter": {
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "files": {
    "ignore": [
      "node_modules",
      ".next",
      "coverage",
      "playwright-report",
      "test-results"
    ]
  }
}
```

### package.json Scripts

```json
{
  "scripts": {
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "format": "biome format --write .",
    "typecheck": "tsc --noEmit"
  }
}
```

### IDE Integration

```json
// .vscode/settings.json
{
  "editor.defaultFormatter": "biomejs.biome",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.organizeImports.biome": "explicit",
    "quickfix.biome": "explicit"
  },
  // Disable conflicting extensions
  "eslint.enable": false,
  "prettier.enable": false
}
```

### What Biome + Ultracite Catches (Examples)

```ts
// ❌ Biome catches these BEFORE tests even run:

// 1. Unused variable (error)
const unused = 'hello'  // → "noUnusedVariables"

// 2. Missing exhaustive deps in useEffect
useEffect(() => { fetchBookings(userId) }, [])  // → "useExhaustiveDependencies"

// 3. Dangerous innerHTML (XSS risk)
<div dangerouslySetInnerHTML={{ __html: userInput }} />  // → "noDangerouslySetInnerHtml"

// 4. Missing button type (a11y)
<button onClick={submit}>Book</button>  // → "useButtonType" (needs type="button")

// 5. Explicit any (type safety)
function process(data: any) {}  // → "noExplicitAny"

// 6. Console.log left in code
console.log('debug')  // → "noConsoleLog" (warn)

// 7. Excessive complexity
function doEverything() { /* 20 branches */ }  // → "noExcessiveCognitiveComplexity"
```

---

## AI-Powered Testing Tools

> **Principal Engineer's Take:** AI testing tools are **force multipliers**, not replacements. They catch regressions humans miss and explore paths nobody thought to test. But they don't replace intentional test design — they augment it.

### Meticulous AI — Zero-Effort Visual Regression

**Rating: 8/10** | **Verdict: ✅ KEEP** | **Cost: Free (<5 devs)**

**What it does:** Records real user sessions on `pprd`, then replays them as visual regression tests on every PR. Catches UI regressions without writing a single test.

**How it fits RGSS:**

```
┌─────────────────────────────────────────────────────────────────┐
│                     METICULOUS AI WORKFLOW                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. RECORD (automatic, ongoing)                                  │
│     • Meticulous script on pprd records all user interactions   │
│     • Builds a "session library" of real user flows            │
│     • No test code written — it learns from usage              │
│                                                                  │
│  2. REPLAY (on every PR)                                        │
│     • GitHub Action triggers Meticulous on PR                   │
│     • Replays recorded sessions against PR preview              │
│     • Captures screenshots at every interaction step           │
│                                                                  │
│  3. DIFF (automated)                                            │
│     • Pixel-level comparison with baseline (main branch)       │
│     • Highlights visual changes: layout shifts, color, text    │
│     • Filters out dynamic content (timestamps, random IDs)     │
│                                                                  │
│  4. REVIEW (human)                                              │
│     • PR comment with visual diff gallery                       │
│     • Developer approves intentional changes                    │
│     • Flags unintentional regressions                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Setup:**

```yaml
# .github/workflows/meticulous.yml
name: Meticulous Visual Tests

on:
  pull_request:
    branches: [test, pprd, prod]

jobs:
  visual-regression:
    runs-on: ubuntu-latest
    steps:
      - uses: alwaysmeticulous/report-diffs-action@v1
        with:
          api-token: ${{ secrets.METICULOUS_API_TOKEN }}
          # Replays sessions against Cloudflare preview URL
          app-url: "https://${{ github.event.pull_request.number }}.rgss-web.pages.dev"
```

**What Meticulous catches that Playwright doesn't:**
- Subtle font rendering changes
- 1px layout shifts after CSS changes
- Color/spacing regressions in components you didn't touch
- Responsive breakpoint issues on real device viewports
- Animation/transition regressions

---

### TestSprite — Autonomous AI E2E Testing

**Rating: 6/10** | **Verdict: ⚠️ CONDITIONAL** | **Cost: Free tier (limited)**

**What it does:** AI agent that explores your app like a real user — clicks buttons, fills forms, navigates flows — and reports crashes, broken links, console errors, accessibility issues, and unexpected behavior. No test scripts needed.

**Honest assessment for RGSS:** The app has limited UI surface (~15 pages). TestSprite's value increases as the app grows. Keep on free tier for nightly exploratory runs. If free tier becomes too restrictive (< 3 runs/week), **drop it** — Playwright E2E covers the critical paths already.

**How it fits RGSS:**

```
┌─────────────────────────────────────────────────────────────────┐
│                     TESTSPRITE WORKFLOW                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  NIGHTLY RUN (2 AM IST on pprd)                                 │
│                                                                  │
│  1. TestSprite AI agent navigates theroyalglow.in (pprd)       │
│     • Explores all public pages autonomously                    │
│     • Attempts booking flows with various inputs               │
│     • Tests edge cases humans might miss                        │
│     • Tries invalid inputs, rapid clicking, back/forward       │
│                                                                  │
│  2. Generates report:                                           │
│     • 🔴 Crashes (JS errors, unhandled exceptions)              │
│     • 🟡 Broken links (404s, dead navigation)                   │
│     • 🟡 Console errors (warnings, deprecations)                │
│     • 🟢 Accessibility violations (contrast, labels)            │
│     • 🟢 Performance observations                               │
│                                                                  │
│  3. Report delivered:                                           │
│     • GitHub Issue created (if critical findings)               │
│     • Slack/email notification                                  │
│     • Screenshots + replay videos attached                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Setup:**

```yaml
# .github/workflows/testsprite-nightly.yml
name: TestSprite AI Exploration

on:
  schedule:
    - cron: '30 20 * * *'  # 2:00 AM IST (20:30 UTC)

jobs:
  explore:
    runs-on: ubuntu-latest
    steps:
      - name: Run TestSprite
        uses: testsprite/action@v1
        with:
          api-key: ${{ secrets.TESTSPRITE_API_KEY }}
          url: "https://pprd.theroyalglow.in"
          # Guide the AI to focus on critical flows
          goals: |
            - Browse all service categories
            - Attempt to book a service (as unauthenticated user)
            - Sign in with Google and complete a booking
            - Navigate the admin dashboard
            - Check all navigation links
            - Test mobile responsiveness (375px viewport)
          max-duration: 30  # minutes
          browsers: [chromium, webkit]
```

**Value for RGSS:**
- Catches regression in flows nobody wrote tests for
- Finds broken states after data changes (new services, removed staff)
- Tests paths that unit/integration tests can't cover (real browser quirks)
- Runs while you sleep — findings ready in the morning

---

### Jules (GitHub AI Agent) — Test Generation

**Rating: 5/10** | **Verdict: ⚠️ USE SPARINGLY** | **Cost: Free (GitHub)**

**What it does:** GitHub's AI coding agent. Assign it issues like "Write integration tests for the booking API" and it creates a PR with tests.

**Honest assessment:** AI-generated tests look right but often have weak assertions (testing that the function ran, not that it's correct). Use it to generate boilerplate for negative test cases, then **manually strengthen the assertions**. Never merge AI tests without mutation testing them first.

**How to use with RGSS:**

```markdown
# GitHub Issue (assign to Jules)
Title: Write integration tests for POST /api/leads and POST /api/bookings

Description:
Write Vitest integration tests for the separate campaign lead capture and normal customer booking endpoints.
Test these scenarios:
- Successful lead creation from Meta/Instagram `/book` landing form with source `meta_ad` (no slot reserved)
- Missing required lead contact details (400)
- Invalid service interest on lead form (400)
- Rate-limited repeated lead submissions (429)
- Successful normal booking creation through `/api/bookings`
- Root-domain first-time onboarding defaults `acquisition_source` to `organic`
- `/?book=1&utm_source=gmb` opens the homepage booking dialog and persists source `gmb` through Google OAuth/onboarding
- `/?book=1&utm_source=walkin` opens the homepage booking dialog and persists source `walkin` through Google OAuth/onboarding
- Homepage Book Now opens the dialog and never navigates to `/book`
- `/book` creates a lead only; it does not create a `customer_profile` until the lead converts
- Booking with invalid service ID (400)
- Booking outside business hours (400)
- Rate limit exceeded (429)

Use the test patterns in tests/integration/api/*.test.ts
Use the test factory in tests/helpers/factory.ts
Test DB: use Neon test branch connection
```

**Best use cases for Jules:**
- Generating test boilerplate for new API routes
- Writing negative test cases (error paths)
- Adding missing edge case tests flagged by mutation testing
- Updating tests after API schema changes

**Rules for AI-generated tests:**
1. Always review AI-generated tests manually before merging
2. AI writes the test, human verifies the assertion is correct
3. Run mutation testing on AI tests to verify they actually catch bugs
4. AI-generated tests must pass the same code review as human-written ones

---

## Unit Testing (Vitest)

### Configuration

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/component/**/*.test.tsx'],
    exclude: ['tests/e2e/**', 'tests/integration/**', 'tests/load/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.d.ts',
        'src/**/types.ts',
        'src/app/layout.tsx',
        'src/app/**/page.tsx',     // Pages are tested via E2E
        'src/components/ui/**',     // shadcn/ui components (third-party)
      ],
      thresholds: {
        // Per-directory thresholds (not blanket 80%)
        'src/lib/': { statements: 95, branches: 90, functions: 95 },
        'src/services/': { statements: 90, branches: 85, functions: 90 },
        'src/utils/': { statements: 95, branches: 90, functions: 95 },
        'src/hooks/': { statements: 80, branches: 75, functions: 80 },
      },
    },
    setupFiles: ['./tests/setup.ts'],
    pool: 'forks',             // Isolation between test files
    poolOptions: {
      forks: { singleFork: false },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@/tests': path.resolve(__dirname, './tests'),
    },
  },
})
```

### What to Unit Test

| Module | What to Test | Example |
|--------|-------------|---------|
| `src/lib/pricing.ts` | Membership discounts, combo pricing, Gems redemption | `calculateTotal({ services, membership, gemsUsed })` |
| `src/lib/availability.ts` | Slot calculation, conflict detection, business hours | `getAvailableSlots({ date, staffId, branch })` |
| `src/lib/scheduling.ts` | Service duration, buffer time, staff overlap | `canBookSlot({ start, end, staffSchedule })` |
| `src/lib/membership.ts` | Tier benefits, expiry logic, upgrade eligibility | `getMembershipBenefits(tier)` |
| `src/lib/gems.ts` | Earning rules, redemption rules, balance validation | `calculateGemsEarned({ invoiceTotal, tier })` |
| `src/lib/validators.ts` | Zod schema edge cases, phone number, email | `bookingSchema.parse(input)` |
| `src/utils/date.ts` | IST timezone handling, business hours check, holidays | `isWithinBusinessHours(dateIST)` |
| `src/utils/invoice.ts` | Invoice number generation, tax calculation, formatting | `generateInvoiceNumber(branch, sequence)` |
| `src/utils/sms.ts` | Message template rendering, character count | `renderBookingConfirmation(data)` |

### Unit Test Patterns

```ts
// tests/unit/services/pricing.test.ts
import { describe, it, expect } from 'vitest'
import { calculateTotal, applyMembershipDiscount } from '@/lib/pricing'

describe('calculateTotal', () => {
  describe('single service', () => {
    it('returns base price when no discounts apply', () => {
      const result = calculateTotal({
        services: [{ id: 's1', price: 1500, name: 'Haircut' }],
        membership: null,
        gemsRedeemed: 0,
        offer: null,
      })

      expect(result).toEqual({
        subtotal: 1500,
        discount: 0,
        gemsDiscount: 0,
        total: 1500,
        breakdown: [{ service: 'Haircut', price: 1500, discount: 0 }],
      })
    })

    it('applies Gold membership 15% discount', () => {
      const result = calculateTotal({
        services: [{ id: 's1', price: 1000, name: 'Facial' }],
        membership: { tier: 'gold', discountPercent: 15 },
        gemsRedeemed: 0,
        offer: null,
      })

      expect(result.discount).toBe(150)
      expect(result.total).toBe(850)
    })

    it('caps Gems redemption at 50% of total', () => {
      const result = calculateTotal({
        services: [{ id: 's1', price: 1000, name: 'Facial' }],
        membership: null,
        gemsRedeemed: 800,  // Trying to redeem more than 50%
        offer: null,
      })

      expect(result.gemsDiscount).toBe(500)  // Capped at 50%
      expect(result.total).toBe(500)
    })
  })

  describe('combo services', () => {
    it('applies combo discount when eligible services selected together', () => {
      const result = calculateTotal({
        services: [
          { id: 's1', price: 800, name: 'Haircut', comboGroup: 'hair-spa' },
          { id: 's2', price: 1200, name: 'Hair Spa', comboGroup: 'hair-spa' },
        ],
        membership: null,
        gemsRedeemed: 0,
        offer: { type: 'combo', discount: 20, comboGroup: 'hair-spa' },
      })

      expect(result.discount).toBe(400)  // 20% off 2000
      expect(result.total).toBe(1600)
    })
  })
})
```

```ts
// tests/unit/services/availability.test.ts
import { describe, it, expect } from 'vitest'
import { getAvailableSlots } from '@/lib/availability'

describe('getAvailableSlots', () => {
  const businessHours = { open: '10:00', close: '20:00' }
  const slotDuration = 60 // minutes

  it('returns all slots when no bookings exist', () => {
    const slots = getAvailableSlots({
      date: '2026-06-01',
      staffId: 'staff-1',
      existingBookings: [],
      serviceDuration: slotDuration,
      businessHours,
    })

    expect(slots).toHaveLength(10) // 10:00 to 19:00 (10 slots)
    expect(slots[0]).toEqual({ start: '10:00', end: '11:00', available: true })
  })

  it('excludes slots that conflict with existing bookings', () => {
    const slots = getAvailableSlots({
      date: '2026-06-01',
      staffId: 'staff-1',
      existingBookings: [
        { start: '11:00', end: '12:00', status: 'confirmed' },
      ],
      serviceDuration: slotDuration,
      businessHours,
    })

    const elevenAm = slots.find(s => s.start === '11:00')
    expect(elevenAm?.available).toBe(false)
  })

  it('accounts for buffer time between services (15 min)', () => {
    const slots = getAvailableSlots({
      date: '2026-06-01',
      staffId: 'staff-1',
      existingBookings: [
        { start: '11:00', end: '12:00', status: 'confirmed' },
      ],
      serviceDuration: 45,
      businessHours,
      bufferMinutes: 15,
    })

    // 12:00-12:15 is buffer → next available is 12:15
    const twelveSlot = slots.find(s => s.start === '12:00')
    expect(twelveSlot?.available).toBe(false) // Can't fit 45min + 15min buffer
  })

  it('returns empty array for past dates', () => {
    const slots = getAvailableSlots({
      date: '2020-01-01',  // Past date
      staffId: 'staff-1',
      existingBookings: [],
      serviceDuration: slotDuration,
      businessHours,
    })

    expect(slots).toHaveLength(0)
  })

  it('excludes cancelled bookings from conflict check', () => {
    const slots = getAvailableSlots({
      date: '2026-06-01',
      staffId: 'staff-1',
      existingBookings: [
        { start: '11:00', end: '12:00', status: 'cancelled' },
      ],
      serviceDuration: slotDuration,
      businessHours,
    })

    const elevenAm = slots.find(s => s.start === '11:00')
    expect(elevenAm?.available).toBe(true) // Cancelled = slot free
  })
})
```

---

## Integration Testing (Vitest + Real DB)

### Configuration

```ts
// vitest.config.integration.ts
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    setupFiles: ['./tests/integration/setup.ts'],
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },  // Sequential — shared DB state
    },
    globalSetup: ['./tests/integration/global-setup.ts'],
    testTimeout: 30000,  // 30s — DB calls can be slow
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

### Test Database Strategy

```ts
// tests/integration/global-setup.ts
import { migrate } from 'drizzle-orm/neon-http/migrator'
import { db } from './test-db'

export async function setup() {
  // 1. Run all migrations on test branch
  await migrate(db, { migrationsFolder: './migrations' })

  // 2. Seed minimal test data
  await seedTestData(db)
}

export async function teardown() {
  // Truncate all tables (order respects FK constraints)
  await db.execute(sql`
    TRUNCATE TABLE
      notification,
      invoice_item,
      invoice,
      booking_status_log,
      booking_service,
      booking,
      spa_membership,
      loyalty_transaction,
      loyalty_account,
      lead_note,
      lead,
      offer_redemption,
      offer_service,
      offer,
      staff_schedule,
      staff_service,
      staff_profile,
      service,
      service_category,
      session,
      account,
      verification,
      user,
      branch
    CASCADE
  `)
}
```

```ts
// tests/integration/setup.ts — runs before each test file
import { beforeEach, afterEach } from 'vitest'
import { db } from './test-db'

// Transaction-based isolation: each test runs in a transaction that rolls back
beforeEach(async (ctx) => {
  ctx.tx = await db.transaction()
})

afterEach(async (ctx) => {
  await ctx.tx.rollback()
})
```

### Test Factory (Deterministic Data)

```ts
// tests/helpers/factory.ts
import { faker } from '@faker-js/faker'

// Seeded faker for deterministic data
faker.seed(42)

export const factory = {
  user(overrides?: Partial<User>) {
    return {
      id: faker.string.nanoid(),
      name: faker.person.fullName(),
      email: faker.internet.email({ provider: 'demo.test' }),
      phone: `+919900${faker.string.numeric(6)}`,
      role: 'customer' as const,
      ...overrides,
    }
  },

  booking(overrides?: Partial<Booking>) {
    return {
      id: faker.string.nanoid(),
      customerId: faker.string.nanoid(),
      serviceId: faker.string.nanoid(),
      staffId: faker.string.nanoid(),
      branchId: 'branch-paa',  // Parappana Agrahara
      date: '2026-06-15',
      startTime: '10:00',
      endTime: '11:00',
      status: 'confirmed' as const,
      ...overrides,
    }
  },

  service(overrides?: Partial<Service>) {
    return {
      id: faker.string.nanoid(),
      name: faker.commerce.productName(),
      categoryId: faker.string.nanoid(),
      duration: 60,
      price: faker.number.int({ min: 200, max: 5000 }),
      isActive: true,
      ...overrides,
    }
  },

  invoice(overrides?: Partial<Invoice>) {
    return {
      id: faker.string.nanoid(),
      bookingId: faker.string.nanoid(),
      customerId: faker.string.nanoid(),
      invoiceNumber: `RGSS-PAA-${faker.string.numeric(6)}`,
      subtotalPaise: 200000,
      discountAmountPaise: 0,
      taxableValuePaise: 169492,
      gstAmountPaise: 30508,
      totalAmountPaise: 200000,
      paymentMethod: 'cash' as const,
      paymentStatus: 'paid' as const,
      ...overrides,
    }
  },

  lead(overrides?: Partial<Lead>) {
    return {
      id: faker.string.nanoid(),
      serviceInterestedId: faker.string.nanoid(),
      name: faker.person.fullName(),
      phone: `+919900${faker.string.numeric(6)}`,
      email: faker.internet.email({ provider: 'demo.test' }),
      source: 'meta_ad',
      utmSource: 'meta',
      utmCampaign: 'facial_may',
      status: 'new' as const,
      ...overrides,
    }
  },
}
```

### Integration Test Examples

```ts
// tests/integration/api/leads.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createTestApp } from '@/tests/helpers/app'
import { factory } from '@/tests/helpers/factory'
import { db } from '@/tests/integration/test-db'

describe('POST /api/leads', () => {
  let app: TestApp
  let service: Service

  beforeEach(async () => {
    app = await createTestApp()
    ;[service] = await db.insert(services).values(factory.service({ duration: 60, price: 1500 })).returning()
  })

  it('creates a lead from the Meta ad /book landing form without reserving a slot', async () => {
    const res = await app.post('/api/leads', {
      body: {
        serviceInterestedId: service.id,
        name: 'Sneha Patil',
        phone: '+919876500001',
        email: 'sneha@example.test',
        utmSource: 'meta',
        utmCampaign: 'facial_may',
      },
    })

    expect(res.status).toBe(201)
    expect(res.body.data).toMatchObject({
      serviceInterestedId: service.id,
      phone: '+919876500001',
      source: 'meta_ad',
      status: 'new',
    })

    // Verify DB state
    const dbLead = await db.query.lead.findFirst({
      where: eq(lead.id, res.body.data.id),
    })
    expect(dbLead).toBeDefined()
  })

  it('returns 400 when required contact details are missing', async () => {
    const res = await app.post('/api/leads', {
      body: {
        serviceInterestedId: service.id,
        utmSource: 'meta',
      },
    })

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('VALIDATION_ERROR')
  })

  it('returns 400 for invalid service interest', async () => {
    const res = await app.post('/api/leads', {
      body: {
        serviceInterestedId: 'non-existent-id',
        name: 'Sneha Patil',
        phone: '+919876500001',
      },
    })

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('VALIDATION_ERROR')
  })

  it('returns 429 when rate limit exceeded', async () => {
    // Make 3 requests (public lead limit)
    for (let i = 0; i < 3; i++) {
      await app.post('/api/leads', {
        body: factory.lead({ serviceInterestedId: service.id, phone: `+91987650000${i}` }),
      })
    }

    // 4th should be rate limited
    const res = await app.post('/api/leads', {
      body: factory.lead({ serviceInterestedId: service.id, phone: '+919876500009' }),
    })

    expect(res.status).toBe(429)
    expect(res.headers['retry-after']).toBeDefined()
  })
})

describe('POST /api/bookings', () => {
  let app: TestApp
  let customer: User
  let service: Service

  beforeEach(async () => {
    app = await createTestApp()
    ;[customer] = await db.insert(users).values(factory.user()).returning()
    ;[service] = await db.insert(services).values(factory.service({ duration: 60, price: 1500 })).returning()
  })

  it('creates a normal booking for an organic/direct customer', async () => {
    const res = await app.post('/api/bookings', {
      auth: customer,
      body: {
        branchId: 'branch-paa',
        serviceType: 'salon',
        serviceIds: [service.id],
        bookingDate: '2026-06-20',
        bookingTime: '10:00',
      },
    })

    expect(res.status).toBe(201)
    expect(res.body.data).toMatchObject({
      customerId: customer.id,
      status: 'pending',
    })
  })
})

describe('Acquisition attribution', () => {
  it('defaults root-domain onboarding to organic when no utm_source exists', async () => {
    const profile = await completeOnboarding({
      entryUrl: 'https://theroyalglow.in',
      persistedContext: null,
    })

    expect(profile.acquisitionSource).toBe('organic')
  })

  it('persists GMB booking context through Google OAuth and onboarding', async () => {
    const profile = await completeOnboarding({
      entryUrl: 'https://theroyalglow.in/?book=1&utm_source=gmb',
      persistedContext: { book: '1', utmSource: 'gmb' },
    })

    expect(profile.acquisitionSource).toBe('gmb')
  })

  it('persists in-store QR booking context through Google OAuth and onboarding', async () => {
    const profile = await completeOnboarding({
      entryUrl: 'https://theroyalglow.in/?book=1&utm_source=walkin',
      persistedContext: { book: '1', utmSource: 'walkin' },
    })

    expect(profile.acquisitionSource).toBe('walkin')
  })

  it('links a converted /book lead by leadId or normalized phone and assigns meta_ad', async () => {
    const lead = await createLead({ source: 'meta_ad', phone: '+919876500001' })
    const profile = await completeOnboarding({
      leadId: lead.id,
      phone: '+91 98765 00001',
    })

    expect(profile.acquisitionSource).toBe('meta_ad')
  })
})
```

```ts
// tests/integration/api/invoices.test.ts
import { describe, it, expect } from 'vitest'

describe('POST /api/admin/invoices/generate', () => {
  it('generates invoice PDF and stores in R2', async () => {
    const booking = await createCompletedBooking()

    const res = await app.post('/api/admin/invoices/generate', {
      body: { bookingId: booking.id, paymentMethod: 'upi' },
      auth: adminUser,
    })

    expect(res.status).toBe(201)
    expect(res.body.data.invoiceNumber).toMatch(/^RGSS-PAA-\d{6}$/)
    expect(res.body.data.pdfUrl).toContain('rgss-invoices')
    expect(res.body.data.paymentMethod).toBe('upi')

    // Verify R2 storage (mock in integration, real in E2E)
    expect(mockR2.putObject).toHaveBeenCalledWith(
      expect.objectContaining({ Key: expect.stringContaining('.pdf') })
    )
  })

  it('prevents non-admin from generating invoices', async () => {
    const res = await app.post('/api/admin/invoices/generate', {
      body: { bookingId: 'booking-1', paymentMethod: 'cash' },
      auth: customerUser,  // Customer, not admin
    })

    expect(res.status).toBe(403)
    expect(res.body.code).toBe('FORBIDDEN')
  })
})
```

---

## Component Testing (Vitest + React Testing Library)

### What to Component Test

Test interactive UI components that have logic (not simple presentational components):

```ts
// tests/component/booking-slot-picker.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { BookingSlotPicker } from '@/components/booking/slot-picker'

describe('BookingSlotPicker', () => {
  const mockSlots = [
    { start: '10:00', end: '11:00', available: true },
    { start: '11:00', end: '12:00', available: false },
    { start: '12:00', end: '13:00', available: true },
  ]

  it('renders available slots as selectable buttons', () => {
    render(<BookingSlotPicker slots={mockSlots} onSelect={vi.fn()} />)

    expect(screen.getByRole('button', { name: /10:00/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /12:00/i })).toBeEnabled()
  })

  it('renders unavailable slots as disabled', () => {
    render(<BookingSlotPicker slots={mockSlots} onSelect={vi.fn()} />)

    expect(screen.getByRole('button', { name: /11:00/i })).toBeDisabled()
  })

  it('calls onSelect with slot data when clicked', async () => {
    const onSelect = vi.fn()
    render(<BookingSlotPicker slots={mockSlots} onSelect={onSelect} />)

    fireEvent.click(screen.getByRole('button', { name: /10:00/i }))

    expect(onSelect).toHaveBeenCalledWith({ start: '10:00', end: '11:00' })
  })

  it('highlights the selected slot', () => {
    render(
      <BookingSlotPicker
        slots={mockSlots}
        selectedSlot="10:00"
        onSelect={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: /10:00/i })).toHaveAttribute(
      'aria-pressed', 'true'
    )
  })
})
```

---

## End-to-End Testing (Playwright)

### Configuration

```ts
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 4 : undefined,
  reporter: process.env.CI
    ? [['html'], ['github'], ['json', { outputFile: 'test-results/results.json' }]]
    : [['html']],
  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },

  projects: [
    // Auth setup (runs first, creates auth state)
    { name: 'auth-setup', testMatch: /auth\.setup\.ts/ },

    // Desktop browsers
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['auth-setup'],
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      dependencies: ['auth-setup'],
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      dependencies: ['auth-setup'],
    },

    // Mobile viewports (critical for salon customers)
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'] },
      dependencies: ['auth-setup'],
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 14'] },
      dependencies: ['auth-setup'],
    },
  ],

  // Start local dev server for local runs
  webServer: process.env.CI ? undefined : {
    command: 'bun run dev',
    port: 3000,
    reuseExistingServer: true,
  },
})
```

### Auth Setup (Google OAuth Mock)

```ts
// tests/e2e/auth.setup.ts
import { test as setup } from '@playwright/test'

// In test environment, Better Auth is configured with a test provider
// that bypasses Google OAuth and directly creates sessions
setup('authenticate as customer', async ({ page }) => {
  // Navigate to test-only auth endpoint (only available in test/dev envs)
  await page.goto('/api/auth/test-login?role=customer&email=customer@demo.test')
  await page.waitForURL('/dashboard')
  await page.context().storageState({ path: './tests/e2e/.auth/customer.json' })
})

setup('authenticate as admin', async ({ page }) => {
  await page.goto('/api/auth/test-login?role=admin&email=admin@demo.test')
  await page.waitForURL('/admin')
  await page.context().storageState({ path: './tests/e2e/.auth/admin.json' })
})

setup('authenticate as receptionist', async ({ page }) => {
  await page.goto('/api/auth/test-login?role=receptionist&email=reception@demo.test')
  await page.waitForURL('/admin')
  await page.context().storageState({ path: './tests/e2e/.auth/receptionist.json' })
})
```

### Critical User Journeys (E2E)

```ts
// tests/e2e/customer/booking-flow.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Customer Booking Flow', () => {
  test.use({ storageState: './tests/e2e/.auth/customer.json' })

  test('complete booking flow: browse → select → book → confirm', async ({ page }) => {
    // 1. Browse services
    await page.goto('/services')
    await expect(page.getByRole('heading', { name: 'Our Services' })).toBeVisible()

    // 2. Select a category
    await page.getByTestId('category-hair').click()
    await expect(page.getByTestId('service-card')).toHaveCount.greaterThan(0)

    // 3. Select a service
    await page.getByTestId('service-card').first().click()
    await page.getByRole('button', { name: 'Book Now' }).click()

    // 4. Select date and slot
    await expect(page.getByTestId('booking-dialog')).toBeVisible()
    await page.getByTestId('date-picker').click()
    await page.getByRole('button', { name: '20' }).click()  // 20th of current month
    await page.getByTestId('slot-10:00').click()

    // 5. Submit booking request (staff is assigned later by receptionist/manager)
    await page.getByRole('button', { name: 'Confirm Booking' }).click()

    // 6. Verify request confirmation
    await expect(page.getByTestId('booking-request-submitted')).toBeVisible()
    await expect(page.getByText('Booking request submitted')).toBeVisible()
  })

  test('homepage Book Now opens the dialog without navigating to /book', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /book now|book appointment/i }).click()

    await expect(page).not.toHaveURL(/\/book/)
    await expect(page.getByTestId('booking-dialog')).toBeVisible()
  })

  test('GMB deep link opens homepage dialog and preserves attribution source', async ({ page }) => {
    await page.goto('/?book=1&utm_source=gmb')

    await expect(page.getByTestId('booking-dialog')).toBeVisible()
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('rgss_acquisition_source'))).toBe('gmb')
  })

  test('in-store QR deep link opens homepage dialog and preserves attribution source', async ({ page }) => {
    await page.goto('/?book=1&utm_source=walkin')

    await expect(page.getByTestId('booking-dialog')).toBeVisible()
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('rgss_acquisition_source'))).toBe('walkin')
  })

  test('/book shows Meta lead capture form, not the normal booking dialog', async ({ page }) => {
    await page.goto('/book')

    await expect(page.getByTestId('lead-capture-form')).toBeVisible()
    await expect(page.getByTestId('booking-dialog')).toBeHidden()
  })

  test('prevents double-booking same slot', async ({ page }) => {
    // Book a slot first
    await bookSlot(page, { date: '2026-06-20', time: '14:00', service: 'Haircut' })

    // Try to book same slot again
    await page.goto('/?book=1')
    await selectDateAndTime(page, '2026-06-20', '14:00')

    // Slot should show as unavailable
    await expect(page.getByTestId('slot-14:00')).toHaveAttribute('aria-disabled', 'true')
  })

  test('shows booking history in customer dashboard', async ({ page }) => {
    await page.goto('/dashboard/bookings')

    await expect(page.getByTestId('booking-list')).toBeVisible()
    await expect(page.getByTestId('booking-card')).toHaveCount.greaterThan(0)
  })
})
```

```ts
// tests/e2e/admin/invoice-flow.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Admin Invoice Generation', () => {
  test.use({ storageState: './tests/e2e/.auth/admin.json' })

  test('complete booking → generate invoice → verify PDF', async ({ page }) => {
    // 1. Navigate to today's bookings
    await page.goto('/admin/bookings')
    await page.getByTestId('booking-row').first().click()

    // 2. Mark as completed
    await page.getByRole('button', { name: 'Mark Completed' }).click()
    await expect(page.getByText('Completed')).toBeVisible()

    // 3. Generate invoice
    await page.getByRole('button', { name: 'Generate Invoice' }).click()

    // 4. Select payment method
    await page.getByTestId('payment-upi').click()
    await page.getByRole('button', { name: 'Create Invoice' }).click()

    // 5. Verify invoice generated
    await expect(page.getByTestId('invoice-number')).toHaveText(/^RGSS-PAA-/)
    await expect(page.getByRole('link', { name: 'Download PDF' })).toBeVisible()

    // 6. Verify PDF is downloadable
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('link', { name: 'Download PDF' }).click(),
    ])
    expect(download.suggestedFilename()).toMatch(/\.pdf$/)
  })
})
```

```ts
// tests/e2e/auth/role-access.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Role-Based Access Control', () => {
  test('customer cannot access /admin routes', async ({ page }) => {
    test.use({ storageState: './tests/e2e/.auth/customer.json' })

    await page.goto('/admin')
    // Should redirect to home or show 403
    await expect(page).not.toHaveURL(/\/admin/)
  })

  test('receptionist cannot access owner-only settings', async ({ page }) => {
    test.use({ storageState: './tests/e2e/.auth/receptionist.json' })

    await page.goto('/admin/settings/billing')
    await expect(page.getByText('Access Denied')).toBeVisible()
  })

  test('unauthenticated user redirected to sign-in', async ({ page }) => {
    // Fresh context — no auth state
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/sign-in/)
  })
})
```

### Accessibility E2E Tests

```ts
// tests/e2e/accessibility/audit.spec.ts
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const pagesToAudit = [
  '/',
  '/?book=1&utm_source=gmb',
  '/?book=1&utm_source=walkin',
  '/services',
  '/book',
  '/offers',
  '/membership',
  '/sign-in',
]

for (const path of pagesToAudit) {
  test(`accessibility audit: ${path}`, async ({ page }) => {
    await page.goto(path)
    await page.waitForLoadState('networkidle')

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze()

    expect(results.violations).toEqual([])
  })
}
```

---

## Performance Testing

### Lighthouse CI Configuration

```json
// lighthouserc.json
{
  "ci": {
    "collect": {
      "url": [
        "http://localhost:3000/",
        "http://localhost:3000/?book=1&utm_source=gmb",
        "http://localhost:3000/services",
        "http://localhost:3000/book",
        "http://localhost:3000/offers",
        "http://localhost:3000/membership"
      ],
      "numberOfRuns": 3,
      "settings": {
        "preset": "desktop",
        "throttling": {
          "cpuSlowdownMultiplier": 1
        }
      }
    },
    "assert": {
      "assertions": {
        "categories:performance": ["error", { "minScore": 0.95 }],
        "categories:accessibility": ["error", { "minScore": 1.0 }],
        "categories:best-practices": ["error", { "minScore": 1.0 }],
        "categories:seo": ["error", { "minScore": 1.0 }],
        "first-contentful-paint": ["error", { "maxNumericValue": 1800 }],
        "largest-contentful-paint": ["error", { "maxNumericValue": 2500 }],
        "cumulative-layout-shift": ["error", { "maxNumericValue": 0.1 }],
        "total-blocking-time": ["error", { "maxNumericValue": 200 }],
        "interactive": ["error", { "maxNumericValue": 3800 }],
        "speed-index": ["warn", { "maxNumericValue": 3400 }]
      }
    },
    "upload": {
      "target": "temporary-public-storage"
    }
  }
}
```

### Performance Budget

| Metric | Budget | Hard Gate? |
|--------|--------|-----------|
| LCP (Largest Contentful Paint) | < 2.5s | ✅ Blocks PR |
| FCP (First Contentful Paint) | < 1.8s | ✅ Blocks PR |
| CLS (Cumulative Layout Shift) | < 0.1 | ✅ Blocks PR |
| TBT (Total Blocking Time) | < 200ms | ✅ Blocks PR |
| TTI (Time to Interactive) | < 3.8s | ✅ Blocks PR |
| Bundle size (JS) | < 200 KB (gzipped) | ⚠️ Warning |
| Bundle size (CSS) | < 50 KB (gzipped) | ⚠️ Warning |
| Image optimization | All images via `next/image` | ✅ Lint rule |

### Unlighthouse — Full-Site Performance Scan

Lighthouse CI tests 5 specific URLs. **Unlighthouse** crawls the entire site and runs Lighthouse on every discoverable page. Catches performance regressions on pages nobody remembered to add to the test list.

```bash
# Run locally or in CI (weekly)
bunx unlighthouse --site https://pprd.theroyalglow.in

# Output: HTML report with scores for EVERY page
# Catches: forgotten pages with missing optimizations, large images, etc.
```

**When to run:** Weekly (Sunday night CI job) — too slow for per-PR but valuable for drift detection.

### Bundle Analysis

```bash
# Visualize what's in the JS bundle
ANALYZE=true bun run build

# @next/bundle-analyzer generates interactive treemap
# Shows: which packages are largest, what's being imported unnecessarily
```

**Guard rail:** If total JS bundle exceeds 200KB gzipped, a warning appears in CI. Investigate before it creeps further.

### Checkly — Synthetic Monitoring in Production

Unlike BetterStack (which pings `/api/health`), **Checkly** runs real Playwright scripts against production on a schedule — simulating actual user flows.

```
Checkly Free Tier: 5 checks, 10,000 check runs/month
```

**RGSS Checkly Checks (5 checks = free tier max):**

| # | Check | Schedule | What it Validates |
|---|-------|----------|-------------------|
| 1 | Homepage loads + services render | Every 10 min | CDN + SSR working |
| 2 | Homepage booking dialog (`?book=1`): slots load for tomorrow | Every 15 min | API + DB connection |
| 3 | Sign-in page renders | Every 30 min | Auth system responsive |
| 4 | Admin dashboard loads (with auth) | Every 30 min | Protected routes work |
| 5 | API health + response time < 500ms | Every 5 min | Overall system health |

**Why Checkly + BetterStack together:**
- BetterStack: Is the site UP? (HTTP 200 check — simple, fast, every 3 min)
- Checkly: Does the site WORK? (Real browser interaction — catches JS errors, broken flows)

---

## Load & Stress Testing (k6)

### Realistic Load Profile for RGSS

Based on expected usage: ~5-20 concurrent users normally, peak ~50 during offer days.

```javascript
// tests/load/realistic-load.js
import http from 'k6/http'
import { check, sleep, group } from 'k6'
import { Counter, Rate, Trend } from 'k6/metrics'

// Custom metrics
const bookingSuccess = new Rate('booking_success')
const bookingDuration = new Trend('booking_duration')

export const options = {
  scenarios: {
    // Scenario 1: Normal traffic (steady state)
    normal_browsing: {
      executor: 'constant-vus',
      vus: 20,
      duration: '5m',
      exec: 'browsing',
    },

    // Scenario 2: Booking spike (offer announcement — WhatsApp blast)
    booking_spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 50 },   // Spike to 50
        { duration: '2m', target: 50 },    // Hold at 50
        { duration: '30s', target: 0 },    // Ramp down
      ],
      exec: 'bookingFlow',
      startTime: '1m',  // Start after 1 min of normal traffic
    },

    // Scenario 3: Stress test (10x expected max)
    stress: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 100 },
        { duration: '3m', target: 200 },
        { duration: '1m', target: 0 },
      ],
      exec: 'browsing',
      startTime: '5m',
    },
  },

  thresholds: {
    // SLA thresholds
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    http_req_failed: ['rate<0.01'],
    'booking_success': ['rate>0.95'],
    'booking_duration': ['p(95)<3000'],  // Full booking < 3s
  },
}

const BASE_URL = __ENV.TARGET || 'https://pprd.theroyalglow.in'
const CUSTOMER_AUTH_TOKEN = __ENV.CUSTOMER_AUTH_TOKEN || ''

// Normal browsing behavior
export function browsing() {
  group('Homepage', () => {
    const res = http.get(`${BASE_URL}/`)
    check(res, { 'homepage 200': (r) => r.status === 200 })
  })

  sleep(Math.random() * 3 + 1)  // 1-4s think time

  group('Services page', () => {
    const res = http.get(`${BASE_URL}/services`)
    check(res, { 'services 200': (r) => r.status === 200 })
  })

  sleep(Math.random() * 2 + 1)

  group('Check availability', () => {
    const date = '2026-06-20'
    const res = http.get(`${BASE_URL}/api/availability/${date}?branchId=branch-paa`)
    check(res, { 'availability 200': (r) => r.status === 200 })
  })

  sleep(Math.random() * 5 + 2)  // Longer think time before next cycle
}

// Booking flow (authenticated)
export function bookingFlow() {
  const start = Date.now()

  group('Booking: Check slots', () => {
    const res = http.get(`${BASE_URL}/api/availability/2026-06-20?branchId=branch-paa`)
    check(res, { 'slots loaded': (r) => r.status === 200 })
  })

  sleep(1)

  group('Booking: Submit request', () => {
    const payload = JSON.stringify({
      branchId: 'branch-paa',
      serviceType: 'salon',
      serviceIds: ['service-haircut'],
      bookingDate: '2026-06-20',
      bookingTime: `${10 + Math.floor(Math.random() * 8)}:00`,
    })

    const res = http.post(`${BASE_URL}/api/bookings`, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${CUSTOMER_AUTH_TOKEN}`,
      },
    })

    const success = res.status === 201 || res.status === 429 // 429 = rate limited under load (expected)
    bookingSuccess.add(success)
    check(res, { 'booking request accepted or rate limited': () => success })
  })

  bookingDuration.add(Date.now() - start)
  sleep(Math.random() * 3 + 2)
}
```

### k6 Threshold Summary

| Scenario | VUs | Duration | p95 Target | Error Target |
|----------|-----|----------|-----------|-------------|
| Normal browsing | 20 | 5 min | < 300ms | < 0.1% |
| Booking spike | 50 | 3 min | < 500ms | < 1% |
| Stress test | 200 | 5 min | < 1000ms | < 5% |
| Soak test (weekly) | 30 | 30 min | < 500ms | < 0.5% |

---

## Security Testing

### Static Analysis (Every PR)

```yaml
# In CI workflow
- name: Trivy vulnerability scan
  uses: aquasecurity/trivy-action@master
  with:
    scan-type: 'fs'
    severity: 'HIGH,CRITICAL'
    exit-code: '1'  # Fail CI on high/critical

- name: Semgrep SAST
  uses: semgrep/semgrep-action@v1
  with:
    config: >-
      p/typescript
      p/nextjs
      p/owasp-top-ten
      p/sql-injection
      p/xss

- name: Socket.dev supply chain check
  uses: SocketDev/socket-security-action@v1
  # Detects: typosquatting, malicious packages, install scripts,
  # obfuscated code, network access in packages that shouldn't have it
```

### Dynamic Analysis (PR to pprd+)

```yaml
- name: OWASP ZAP baseline scan
  uses: zaproxy/action-baseline@v0.9.0
  with:
    target: 'https://pprd.theroyalglow.in'
    rules_file_name: 'zap-rules.tsv'
    fail_action: 'true'  # Fail on WARN or higher
```

### Security Test Cases (Manual + Automated)

| # | Category | Test | Automated? |
|---|----------|------|-----------|
| SEC-01 | Auth bypass | Access admin API without session | ✅ Integration test |
| SEC-02 | IDOR | Access another user's booking | ✅ Integration test |
| SEC-03 | SQL injection | Malicious input in search | ✅ Semgrep + integration |
| SEC-04 | XSS (stored) | Script in customer name | ✅ Integration + E2E |
| SEC-05 | XSS (reflected) | Script in URL params | ✅ ZAP |
| SEC-06 | Rate limiting | Brute force auth endpoint | ✅ Integration test |
| SEC-07 | CSRF | Cross-origin form submission | ✅ E2E test |
| SEC-08 | Privilege escalation | Customer → admin role switch | ✅ Integration test |
| SEC-09 | Mass assignment | Extra fields in booking request | ✅ Zod schema |
| SEC-10 | Path traversal | `../` in file download paths | ✅ Integration test |

---

## Contract Testing (API Schema Validation)

### Zod as Runtime Contract

```ts
// src/lib/contracts/lead.ts
import { z } from 'zod'

// This schema is the single source of truth
// Used by: API route validation, client-side form, tests
export const createLeadSchema = z.object({
  serviceInterestedId: z.string().min(1).optional(),
  name: z.string().min(2),
  phone: z.string().min(10),
  email: z.string().email().optional(),
  source: z.literal('meta_ad').default('meta_ad'),
  utmSource: z.string().max(50).optional(),
  utmCampaign: z.string().max(100).optional(),
  utmMedium: z.string().max(50).optional(),
  utmContent: z.string().max(100).optional(),
})

export const leadResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    id: z.string().min(1),
    serviceInterestedId: z.string().min(1).nullable(),
    phone: z.string(),
    source: z.literal('meta_ad'),
    status: z.enum(['new', 'contacted', 'follow_up', 'booked', 'won', 'lost']),
    createdAt: z.string().datetime(),
  }),
})

export type CreateLeadInput = z.infer<typeof createLeadSchema>
export type LeadResponse = z.infer<typeof leadResponseSchema>
```

### Contract Test

```ts
// tests/integration/contracts/lead-contract.test.ts
import { describe, it, expect } from 'vitest'
import { leadResponseSchema } from '@/lib/contracts/lead'

describe('Lead API Contract', () => {
  it('POST /api/leads response matches contract', async () => {
    const res = await app.post('/api/leads', {
      body: validLeadInput,
    })

    // If this fails, the API broke its contract with the frontend
    const parsed = leadResponseSchema.safeParse(res.body)
    expect(parsed.success).toBe(true)
  })
})
```

---

## Chaos & Resilience Testing

### External Service Failure Scenarios

| Scenario | Expected Behavior | Test Method |
|----------|-------------------|-------------|
| Neon DB unreachable | Health check fails, BetterStack alerts, cached pages still serve | Integration test with mock |
| Resend API down | Booking succeeds, email queued in QStash for retry | Integration test |
| Ably disconnected | UI shows "reconnecting", no data loss | E2E test (network intercept) |
| Upstash Redis down | Rate limiting disabled (allow all), logging warning | Integration test |
| Render PDF API down | Invoice marked "pending_pdf", retried via QStash | Integration test |
| Cloudflare R2 down | PDF upload queued for retry, invoice still created in DB | Integration test |

### Implementation

```ts
// tests/integration/resilience/external-service-down.test.ts
import { describe, it, expect, vi } from 'vitest'

describe('Resilience: Resend email failure', () => {
  it('booking completion succeeds even when invoice email is down', async () => {
    // Mock Resend to throw
    vi.spyOn(resendClient.emails, 'send').mockRejectedValue(
      new Error('Service Unavailable')
    )

    const res = await app.post('/api/admin/bookings/booking_123/complete', {
      body: { paymentMethod: 'cash' },
      auth: receptionist,
    })

    // Booking completion STILL succeeds (email is non-critical)
    expect(res.status).toBe(201)
    expect(res.body.data.status).toBe('completed')

    // Email queued for retry
    expect(mockQStash.publish).toHaveBeenCalledWith(
      expect.objectContaining({ topic: 'email-retry' })
    )
  })
})
```

---

## Mocking Strategy (MSW + Vitest)

### Why MSW (Mock Service Worker)

Manual `vi.mock()` for external services is brittle — it mocks at the module level, not the network level. **MSW intercepts actual HTTP requests**, making tests closer to reality.

| Approach | Pros | Cons |
|----------|------|------|
| `vi.mock('./resend')` | Simple, fast | Misses real HTTP behavior, couples to implementation |
| `vi.spyOn(client, 'send')` | Can verify calls | Still skips network layer, headers, serialization |
| **MSW handlers** | Intercepts real HTTP, tests full request/response cycle | Slight setup overhead (worth it) |

### MSW Setup for RGSS

```ts
// tests/mocks/handlers.ts
import { http, HttpResponse } from 'msw'

export const handlers = [
  // Resend (email)
  http.post('https://api.resend.com/emails', () => {
    return HttpResponse.json({ id: 'email_mock_123' }, { status: 200 })
  }),

  // Brevo (marketing email)
  http.post('https://api.brevo.com/v3/smtp/email', () => {
    return HttpResponse.json({ messageId: 'brevo_mock_456' }, { status: 201 })
  }),

  // Ably (realtime publish)
  http.post('https://rest.ably.io/channels/*/messages', () => {
    return HttpResponse.json({}, { status: 201 })
  }),

  // AiSensy (WhatsApp)
  http.post('https://backend.aisensy.com/campaign/*/api/v2', () => {
    return HttpResponse.json({ status: 'sent' }, { status: 200 })
  }),

  // Render PDF API
  http.post('https://rgss-pdf-api.onrender.com/generate', () => {
    return HttpResponse.arrayBuffer(new ArrayBuffer(1024), {
      status: 200,
      headers: { 'Content-Type': 'application/pdf' },
    })
  }),

  // Cloudflare R2 (S3-compatible)
  http.put(/.*r2\.cloudflarestorage\.com.*/, () => {
    return HttpResponse.json({}, { status: 200 })
  }),

  // QStash (async job queue)
  http.post('https://qstash.upstash.io/v2/publish/*', () => {
    return HttpResponse.json({ messageId: 'qstash_mock_789' }, { status: 200 })
  }),
]
```

```ts
// tests/mocks/server.ts
import { setupServer } from 'msw/node'
import { handlers } from './handlers'

export const server = setupServer(...handlers)
```

```ts
// tests/setup.ts (shared across unit + integration)
import { server } from './mocks/server'

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
```

### Overriding for Specific Tests

```ts
// Test: what happens when Resend is DOWN?
import { http, HttpResponse } from 'msw'
import { server } from '@/tests/mocks/server'

it('handles email service outage gracefully', async () => {
  // Override the default Resend handler for this test only
  server.use(
    http.post('https://api.resend.com/emails', () => {
      return HttpResponse.json(
        { error: 'Service Unavailable' },
        { status: 503 }
      )
    })
  )

  const res = await app.post('/api/admin/bookings/booking_123/complete', {
    body: { paymentMethod: 'cash' },
    auth: receptionist,
  })
  expect(res.status).toBe(201)  // Completion still succeeds
})
```

### When to Use MSW vs vi.mock()

| Scenario | Use |
|----------|-----|
| Testing API route handler end-to-end | MSW |
| Testing service layer that calls external APIs | MSW |
| Testing a utility function with injected dependency | `vi.mock()` or dependency injection |
| Testing React component that fetches data | MSW |
| Testing pure business logic (no I/O) | Neither — no mocking needed |

---

## Test Data Management

### Fixture Strategy

```
tests/
├── fixtures/
│   ├── services.json          # All 63 services (production-like)
│   ├── categories.json        # 10 categories
│   ├── staff.json             # 8 seeded users covering all roles/designations
│   ├── customers/
│   │   ├── active.json        # Customer with active membership
│   │   ├── new.json           # Brand new customer
│   │   ├── dormant.json       # Inactive 90+ days
│   │   └── vip.json           # Platinum member with Gems
│   ├── bookings/
│   │   ├── confirmed.json
│   │   ├── completed.json
│   │   ├── cancelled.json
│   │   └── no-show.json
│   └── memberships/
│       ├── active-gold.json
│       ├── expiring-soon.json
│       └── expired.json
```

### Data Reset Between Test Suites

```ts
// tests/helpers/reset.ts
export async function resetTestDB() {
  // Only allowed on test/dev Neon branches
  if (!process.env.DATABASE_URL?.includes('test') && 
      !process.env.DATABASE_URL?.includes('dev')) {
    throw new Error('SAFETY: Cannot reset non-test database!')
  }

  await db.execute(sql`
    DO $$ 
    DECLARE r RECORD;
    BEGIN
      FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
        EXECUTE 'TRUNCATE TABLE ' || r.tablename || ' CASCADE';
      END LOOP;
    END $$;
  `)

  await seedTestFixtures()
}
```

---

## CI Pipeline Integration

### Full Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          CI/CD TESTING PIPELINE                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  EVERY PUSH (< 2 min)                                                       │
│  ├─ TypeScript strict compile (tsc --noEmit)                                │
│  ├─ Biome lint + format check                                               │
│  └─ Unit tests (Vitest — parallel)                                          │
│                                                                              │
│  PR to dev (< 5 min)                                                        │
│  ├─ Everything above                                                         │
│  ├─ Component tests (React Testing Library)                                  │
│  ├─ Trivy + Semgrep security scan                                           │
│  └─ Meticulous AI visual diff (async — comments on PR)                      │
│                                                                              │
│  PR to test (< 10 min)                                                      │
│  ├─ Everything above                                                         │
│  ├─ Integration tests (Vitest + Neon test branch)                           │
│  ├─ E2E tests (Playwright — 3 browsers + 2 mobile)                         │
│  ├─ Accessibility audit (axe-core)                                          │
│  └─ Lighthouse CI (performance budget)                                       │
│                                                                              │
│  PR to pprd (< 20 min)                                                      │
│  ├─ Everything above                                                         │
│  ├─ k6 load test (realistic-load.js)                                        │
│  ├─ OWASP ZAP security scan                                                │
│  └─ TestSprite AI exploration (async — reports next morning)                │
│                                                                              │
│  PR to prod (requires manual approval)                                      │
│  ├─ All gates from above must be green                                      │
│  ├─ UAT sign-off (human)                                                    │
│  └─ Go/No-Go decision                                                       │
│                                                                              │
│  POST-DEPLOY (production)                                                   │
│  ├─ Health check (automated — /api/health)                                  │
│  ├─ Smoke test suite (5 critical Playwright tests)                          │
│  └─ BetterStack synthetic monitoring (ongoing)                              │
│                                                                              │
│  NIGHTLY (2 AM IST)                                                         │
│  ├─ TestSprite autonomous exploration on pprd                               │
│  ├─ Full regression suite (all E2E — not just PR-affected)                  │
│  └─ Dependency vulnerability re-scan                                        │
│                                                                              │
│  WEEKLY (Sunday)                                                            │
│  ├─ k6 soak test (30 min sustained load)                                   │
│  └─ Lighthouse performance trend comparison                                 │
│                                                                              │
│  QUARTERLY                                                                  │
│  ├─ Mutation testing (Stryker — test effectiveness audit)                   │
│  ├─ Chaos testing (manually inject failures)                                │
│  └─ Security penetration test (manual)                                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### GitHub Actions Workflow (Comprehensive)

```yaml
# .github/workflows/test-suite.yml
name: Test Suite

on:
  pull_request:
    branches: [dev, test, pprd, prod]
  push:
    branches: [dev]

concurrency:
  group: tests-${{ github.ref }}
  cancel-in-progress: true

env:
  BUN_VERSION: '1.2'
  NODE_VERSION: '20'

jobs:
  # ─────────────────────────────────────────────────────────
  # STAGE 1: Fast checks (every PR)
  # ─────────────────────────────────────────────────────────
  typecheck:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with: { bun-version: '${{ env.BUN_VERSION }}' }
      - uses: actions/cache@v4
        with:
          path: ~/.bun/install/cache
          key: bun-${{ runner.os }}-${{ hashFiles('bun.lockb') }}
      - run: bun install --frozen-lockfile
      - run: bun run typecheck

  lint:
    runs-on: ubuntu-latest
    timeout-minutes: 3
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run lint

  unit-tests:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - uses: actions/cache@v4
        with:
          path: ~/.bun/install/cache
          key: bun-${{ runner.os }}-${{ hashFiles('bun.lockb') }}
      - run: bun install --frozen-lockfile
      - run: bun run test:unit -- --coverage
      - uses: actions/upload-artifact@v4
        with:
          name: coverage-report
          path: coverage/

  security-scan:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4
      - uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'fs'
          severity: 'HIGH,CRITICAL'
          exit-code: '1'
      - uses: semgrep/semgrep-action@v1
        with:
          config: 'p/typescript p/nextjs p/owasp-top-ten'

  # ─────────────────────────────────────────────────────────
  # STAGE 2: Integration (PR to test+)
  # ─────────────────────────────────────────────────────────
  integration-tests:
    if: github.base_ref == 'test' || github.base_ref == 'pprd' || github.base_ref == 'prod'
    needs: [typecheck, lint, unit-tests]
    runs-on: ubuntu-latest
    timeout-minutes: 15
    env:
      DATABASE_URL: ${{ secrets.DATABASE_URL_TEST }}
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run db:migrate  # Apply latest migrations to test branch
      - run: bun run test:integration

  e2e-tests:
    if: github.base_ref == 'test' || github.base_ref == 'pprd' || github.base_ref == 'prod'
    needs: [typecheck, lint, unit-tests]
    runs-on: ubuntu-latest
    timeout-minutes: 20
    strategy:
      matrix:
        shard: [1, 2, 3, 4]  # Parallel sharding
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: playwright-${{ runner.os }}-${{ hashFiles('bun.lockb') }}
      - run: bunx playwright install --with-deps chromium firefox webkit
      - run: bun run build
      - run: |
          bunx playwright test \
            --shard=${{ matrix.shard }}/4 \
            --reporter=blob
        env:
          E2E_BASE_URL: http://localhost:3000
          DATABASE_URL: ${{ secrets.DATABASE_URL_TEST }}
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report-${{ matrix.shard }}
          path: blob-report/

  # Merge sharded reports
  e2e-report:
    if: always()
    needs: [e2e-tests]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
        with:
          pattern: playwright-report-*
          merge-multiple: true
          path: all-blob-reports
      - run: bunx playwright merge-reports --reporter html ./all-blob-reports
      - uses: actions/upload-artifact@v4
        with:
          name: playwright-html-report
          path: playwright-report/

  lighthouse:
    if: github.base_ref == 'test' || github.base_ref == 'pprd' || github.base_ref == 'prod'
    needs: [typecheck]
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run build
      - run: bun run start &
      - run: bunx lhci autorun
      - uses: actions/upload-artifact@v4
        with:
          name: lighthouse-report
          path: .lighthouseci/

  accessibility:
    if: github.base_ref == 'test' || github.base_ref == 'pprd' || github.base_ref == 'prod'
    needs: [typecheck]
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bunx playwright install --with-deps chromium
      - run: bun run build && bun run start &
      - run: bun run test:a11y

  # ─────────────────────────────────────────────────────────
  # STAGE 3: Load & Security (PR to pprd+)
  # ─────────────────────────────────────────────────────────
  load-test:
    if: github.base_ref == 'pprd' || github.base_ref == 'prod'
    needs: [integration-tests, e2e-tests]
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: grafana/k6-action@v0.3.1
        with:
          filename: tests/load/realistic-load.js
        env:
          TARGET: https://pprd.theroyalglow.in
          TEST_TOKEN: ${{ secrets.LOAD_TEST_TOKEN }}

  dast-scan:
    if: github.base_ref == 'pprd' || github.base_ref == 'prod'
    needs: [integration-tests]
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: zaproxy/action-baseline@v0.9.0
        with:
          target: 'https://pprd.theroyalglow.in'
          fail_action: 'true'
```

---

## Pre-Commit Hooks & Local Quality Gates

### Philosophy

> Catch issues in **seconds** (on save/commit), not in **minutes** (CI). The developer should never push code that will fail CI.

### Tooling: Husky + lint-staged

```json
// package.json
{
  "scripts": {
    "prepare": "husky"
  },
  "lint-staged": {
    "*.{ts,tsx}": [
      "biome check --write",
      "biome format --write"
    ],
    "*.{json,md}": [
      "biome format --write"
    ]
  }
}
```

```bash
# .husky/pre-commit
bunx lint-staged
```

```bash
# .husky/pre-push
bun run typecheck
bun run test:unit -- --run
```

### Local Quality Gate Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    LOCAL DEVELOPER FLOW                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ON SAVE (< 50ms)                                               │
│  └─ Biome format + lint (IDE integration, instant)              │
│                                                                  │
│  ON COMMIT (< 3s)                                               │
│  └─ lint-staged: Biome check only staged files                  │
│                                                                  │
│  ON PUSH (< 30s)                                                │
│  ├─ TypeScript typecheck (tsc --noEmit)                         │
│  └─ Unit tests (fast subset — affected files only)              │
│                                                                  │
│  ON PR CREATE (CI takes over — 5-20 min)                        │
│  └─ Full test suite per pipeline stage                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Why Not Run All Tests on Pre-Commit?

- Pre-commit must be **< 5 seconds** or developers bypass it (`--no-verify`)
- Unit tests on pre-push is a compromise — fast enough to not annoy, thorough enough to catch regressions
- Full suite belongs in CI (integration tests need DB, E2E needs browser)

---

## Mutation Testing (Quarterly Audit)

### What Is Mutation Testing?

Mutation testing modifies your source code (introduces bugs) and checks if tests catch them. If a test suite passes with a bug injected, the tests are weak.

### Setup

```json
// stryker.config.json
{
  "$schema": "./node_modules/@stryker-mutator/core/schema/stryker-schema.json",
  "mutate": [
    "src/lib/**/*.ts",
    "src/services/**/*.ts",
    "!src/**/*.d.ts"
  ],
  "testRunner": "vitest",
  "reporters": ["html", "clear-text", "progress"],
  "thresholds": {
    "high": 80,
    "low": 60,
    "break": 50
  }
}
```

### Target Scores

| Module | Minimum Mutation Score | Rationale |
|--------|----------------------|-----------|
| `src/lib/pricing.ts` | > 90% | Money calculations — must be bulletproof |
| `src/lib/availability.ts` | > 85% | Booking conflicts — critical |
| `src/lib/membership.ts` | > 80% | Business rules |
| `src/lib/gems.ts` | > 85% | Loyalty math — affects customer trust |
| `src/services/` | > 75% | Service orchestration |

---

## Test Environments & Data

### Environment Matrix

| Branch | Neon Branch | Purpose | Data State | Reset Frequency |
|--------|------------|---------|-----------|-----------------|
| `dev` | `dev` | Local development | Full seed (15 customers, all services) | On demand |
| `test` | `test` | CI testing | Deterministic fixtures (known IDs) | Every CI run |
| `pprd` | `preprod` | UAT + load testing | Realistic data (~50 customers, PII stripped) | Daily (from prod snapshot) |
| `prod` | `main` | Production | Real customer data | Never reset |

### Test Isolation Rules

1. **Unit tests:** Zero external dependencies — mock everything
2. **Integration tests:** Real Neon test branch, mock external services (Resend, Ably, etc.)
3. **E2E tests:** Real app + real Neon test branch + mock OAuth
4. **Load tests:** Real pprd environment (full stack)
5. **TestSprite/Meticulous:** Real pprd environment

---

## Flaky Test Management

### Policy

```
A flaky test is worse than no test — it erodes trust in the entire suite.
```

### Detection & Handling

```yaml
# Playwright auto-retry + flaky detection
retries: process.env.CI ? 2 : 0  # Retry up to 2x in CI

# Vitest retry for integration tests
# vitest.config.integration.ts
retry: process.env.CI ? 1 : 0
```

### Flaky Test Protocol

| Step | Action | Timeline |
|------|--------|----------|
| 1 | Test fails intermittently in CI | Immediate detection |
| 2 | Auto-labeled `flaky` in test report | Automated |
| 3 | Quarantined (moved to `.skip` with `// FLAKY:` comment) | Same day |
| 4 | Root cause investigated | Within 24h |
| 5 | Fixed or permanently removed | Within 48h |
| 6 | If removed: replacement test written (different approach) | Within 1 week |

### Common Flakiness Sources in RGSS

| Source | Fix |
|--------|-----|
| Database race conditions | Transaction-based test isolation |
| Timing (slots/availability) | Use fixed dates far in future (`2099-01-01`) |
| Animation delays in E2E | `waitForLoadState('networkidle')` + explicit waits |
| Cloudflare edge caching | Bust cache with unique query params in tests |
| Random data causing edge cases | Seeded faker (`faker.seed(42)`) |

---

## Coverage Requirements

### Thresholds (Hard Gates in CI)

| Directory | Statements | Branches | Functions | Lines |
|-----------|-----------|----------|-----------|-------|
| `src/lib/` | 95% | 90% | 95% | 95% |
| `src/services/` | 90% | 85% | 90% | 90% |
| `src/utils/` | 95% | 90% | 95% | 95% |
| `src/hooks/` | 80% | 75% | 80% | 80% |
| `src/app/api/` | 85% | 80% | 85% | 85% |
| **Overall minimum** | **85%** | **80%** | **85%** | **85%** |

### What NOT to Measure Coverage On

- `src/components/ui/**` — shadcn/ui third-party components
- `src/app/**/layout.tsx` — Layouts (tested via E2E)
- `src/app/**/page.tsx` — Pages (tested via E2E)
- `*.d.ts` — Type definitions
- `migrations/**` — SQL migrations (tested by running them)
- `scripts/**` — One-time scripts

---

## Test Naming & Organization Conventions

### File Naming

```
[module-name].test.ts          → Unit/Integration tests
[feature-name].spec.ts         → E2E (Playwright) tests
[module-name].bench.ts         → Benchmarks (optional)
```

| Convention | Example | Rationale |
|-----------|---------|-----------|
| `.test.ts` for Vitest | `pricing.test.ts` | Vitest default pattern |
| `.spec.ts` for Playwright | `booking-flow.spec.ts` | Playwright default pattern |
| Mirror source structure | `src/lib/pricing.ts` → `tests/unit/lib/pricing.test.ts` | Easy to locate |
| Group by feature in E2E | `tests/e2e/customer/booking-flow.spec.ts` | User journey oriented |

### Test Description Naming

**Pattern:** `[action] [outcome] [condition]`

```ts
// ✅ GOOD — describes behavior clearly
describe('calculateTotal', () => {
  it('returns base price when no discounts apply')
  it('applies Gold membership 15% discount')
  it('caps Gems redemption at 50% of total')
  it('throws when service list is empty')
})

describe('POST /api/leads', () => {
  it('creates a meta_ad lead from /book without reserving a slot')
  it('returns 400 when required contact details are missing')
  it('returns 400 for invalid service interest')
  it('returns 429 for repeated submissions')
})

// ❌ BAD — vague, doesn't describe expected outcome
it('works correctly')
it('handles error')
it('test booking')
it('should return something')
```

### Describe Block Organization

```ts
describe('[Module/Route]', () => {
  describe('[method/scenario]', () => {
    // Happy path FIRST
    it('[success case]')
    it('[another success variant]')

    // Then error cases
    it('[validation error]')
    it('[auth error]')
    it('[business rule violation]')

    // Edge cases LAST
    it('[boundary condition]')
    it('[concurrent access]')
  })
})
```

### data-testid Convention

```
Pattern: [component]-[element]-[qualifier]

Examples:
  data-testid="booking-slot-1000"      → Slot button for 10:00
  data-testid="service-card"           → Service card (generic)
  data-testid="category-hair"          → Hair category filter
  data-testid="payment-upi"            → UPI payment option
  data-testid="booking-confirmed"      → Confirmation status
  data-testid="staff-preference-note"  → optional customer preference note
  data-testid="invoice-number"         → Invoice number display

Rules:
  • kebab-case only
  • Never use for styling (never in CSS selectors)
  • Only on interactive/assertable elements
  • Stable — never tied to data that changes (no IDs)
```

---

## Snapshot Testing Policy

### When to Use Snapshots

| Use Case | Verdict | Why |
|----------|---------|-----|
| API response shape validation | ✅ Use inline snapshots | Catches accidental contract changes |
| Email template rendering | ✅ Use file snapshots | Templates change rarely, visual correctness matters |
| Error message formatting | ✅ Use inline snapshots | Ensures consistent error messages |
| React component rendering | ❌ AVOID | Snapshots of JSX are brittle, break on every minor change |
| Large JSON objects | ❌ AVOID | Hard to review in PRs, meaningless diffs |
| Database query results | ❌ AVOID | Use explicit assertions instead |

### Inline Snapshot Example (Good Use)

```ts
it('formats invoice number correctly', () => {
  const result = formatInvoiceNumber('PAA', 42)
  expect(result).toMatchInlineSnapshot(`"RGSS-PAA-000042"`)
})

it('renders booking confirmation email subject', () => {
  const subject = getEmailSubject('booking-confirmed', { serviceName: 'Haircut' })
  expect(subject).toMatchInlineSnapshot(`"Your Haircut is Confirmed ✓"`)
})
```

### Snapshot Rules

1. **Prefer explicit assertions** over snapshots for critical business logic
2. **Inline snapshots** over file snapshots (easier to review in PRs)
3. **Never snapshot entire React component trees** — use RTL queries instead
4. **Update snapshots intentionally** — `bun run test:unit -- -u` only after verifying change is correct
5. **Review snapshot updates in PRs** — treat `.snap` file changes with same scrutiny as source code

---

## Reporting & Observability

### Test Dashboards

| Report | Location | Updated |
|--------|----------|---------|
| Coverage report | GitHub Actions artifact + Codecov | Every PR |
| Playwright HTML report | GitHub Actions artifact | Every PR |
| Lighthouse trend | Lighthouse CI server (temporary-public-storage) | Every PR |
| k6 results | GitHub Actions summary | PR to pprd+ |
| Meticulous visual diffs | PR comment (inline gallery) | Every PR |
| TestSprite findings | GitHub Issues (auto-created) | Nightly |
| Mutation score | Quarterly report (HTML artifact) | Quarterly |
| Flaky test tracker | GitHub label + team board | Ongoing |

### Test Health Metrics (Track Monthly)

| Metric | Target | Action if Missed |
|--------|--------|------------------|
| Total test count | Growing (never decreasing) | Review deleted tests |
| CI pass rate | > 98% | Investigate flaky tests |
| Avg CI duration (PR to test) | < 10 min | Optimize parallelism, caching |
| Coverage trend | Stable or increasing | Review uncovered new code |
| Mutation score (quarterly) | > 75% overall | Write better assertions |
| Time to fix flaky test | < 48h | Prioritize in sprint |
| E2E test count vs features | Every feature has ≥ 1 E2E | Review during PR |

---

## File Structure

```
tests/
├── unit/
│   ├── lib/
│   │   ├── pricing.test.ts           # Pricing calculations
│   │   ├── availability.test.ts      # Slot availability logic
│   │   ├── scheduling.test.ts        # Staff scheduling rules
│   │   ├── membership.test.ts        # Membership tier logic
│   │   ├── gems.test.ts              # Loyalty points
│   │   └── validators.test.ts        # Zod schema tests
│   ├── utils/
│   │   ├── date.test.ts              # IST timezone, business hours
│   │   ├── invoice.test.ts           # Invoice number, tax calc
│   │   └── sms.test.ts              # Message templates
│   └── hooks/
│       ├── use-booking.test.ts       # Booking state hook
│       └── use-realtime.test.ts      # Ably subscription hook
│
├── component/
│   ├── booking-slot-picker.test.tsx
│   ├── service-card.test.tsx
│   ├── membership-tier-card.test.tsx
│   ├── invoice-preview.test.tsx
│   └── admin-booking-row.test.tsx
│
├── integration/
│   ├── setup.ts                       # DB transaction setup
│   ├── global-setup.ts               # Migration + seed
│   ├── test-db.ts                    # Test DB connection
│   ├── api/
│   │   ├── bookings.test.ts          # Booking CRUD
│   │   ├── services.test.ts          # Service listing
│   │   ├── invoices.test.ts          # Invoice generation
│   │   ├── memberships.test.ts       # Membership management
│   │   ├── availability.test.ts      # Slot availability
│   │   ├── auth.test.ts             # Auth flows
│   │   └── admin.test.ts            # Admin-only endpoints
│   ├── db/
│   │   ├── booking-queries.test.ts    # Complex queries
│   │   └── reporting-queries.test.ts  # Aggregation queries
│   ├── services/
│   │   ├── email-service.test.ts      # Resend integration
│   │   ├── pdf-service.test.ts        # Render PDF API
│   │   └── notification-service.test.ts  # Ably + AiSensy
│   ├── contracts/
│   │   ├── booking-contract.test.ts   # API schema validation
│   │   └── invoice-contract.test.ts
│   └── resilience/
│       ├── external-service-down.test.ts
│       └── rate-limiting.test.ts
│
├── e2e/
│   ├── auth.setup.ts                  # Auth state setup
│   ├── customer/
│   │   ├── booking-flow.spec.ts       # Book a service
│   │   ├── cancel-booking.spec.ts     # Cancel booking
│   │   ├── view-history.spec.ts       # Past bookings
│   │   ├── membership.spec.ts         # Join membership
│   │   └── gems.spec.ts              # Redeem Gems
│   ├── admin/
│   │   ├── dashboard.spec.ts          # Admin home
│   │   ├── manage-bookings.spec.ts    # Complete/no-show
│   │   ├── invoice-flow.spec.ts       # Generate invoice
│   │   ├── walk-in.spec.ts           # Walk-in booking
│   │   ├── staff-schedule.spec.ts     # Staff management
│   │   └── reports.spec.ts           # Revenue reports
│   ├── auth/
│   │   ├── sign-in.spec.ts           # Google OAuth flow
│   │   ├── role-access.spec.ts       # RBAC enforcement
│   │   └── session-expiry.spec.ts    # Session handling
│   ├── accessibility/
│   │   └── audit.spec.ts            # axe-core full audit
│   └── smoke/
│       └── production-smoke.spec.ts  # Post-deploy verification (5 tests)
│
├── load/
│   ├── realistic-load.js             # Normal + spike + stress
│   ├── booking-spike.js              # Offer day simulation
│   ├── soak-test.js                 # 30-min sustained load
│   └── stress-test.js              # Find breaking point
│
├── helpers/
│   ├── factory.ts                    # Test data factory
│   ├── app.ts                       # Test app builder
│   ├── reset.ts                     # DB reset utility
│   └── auth.ts                      # Auth helpers
│
├── fixtures/
│   ├── services.json
│   ├── categories.json
│   ├── staff.json
│   ├── customers/
│   ├── bookings/
│   └── memberships/
│
└── __mocks__/
    ├── handlers.ts                   # MSW request handlers (all external APIs)
    ├── server.ts                     # MSW server setup
    ├── overrides/
    │   ├── resend-down.ts            # Resend 503 scenario
    │   ├── ably-timeout.ts           # Ably connection timeout
    │   └── r2-quota-exceeded.ts      # R2 storage full
    └── fixtures/
        ├── resend-webhook.json       # Resend webhook payload samples
        └── brevo-webhook.json        # Brevo webhook payload samples
```

---

## Commands

```bash
# Unit tests
bun run test:unit                    # Run all unit tests
bun run test:unit -- --watch         # Watch mode (development)
bun run test:unit -- --coverage      # With coverage report

# Component tests
bun run test:component               # React component tests

# Integration tests
bun run test:integration             # Run against test Neon branch
bun run test:integration -- --watch  # Watch mode

# E2E tests
bun run test:e2e                     # All browsers
bun run test:e2e -- --project=chromium  # Single browser
bun run test:e2e -- --ui             # Interactive UI mode
bun run test:e2e -- --debug          # Debug mode (headed)

# Specific test suites
bun run test:a11y                    # Accessibility only
bun run test:smoke                   # Post-deploy smoke tests

# Performance
bun run test:lighthouse              # Lighthouse CI
bun run test:load                    # k6 load test (against pprd)

# Security
bun run test:security                # Trivy + Semgrep

# All tests (CI simulation)
bun run test:all                     # Everything in sequence

# Utilities
bun run test:reset-db                # Reset test database
bun run test:seed                    # Re-seed test data
bun run test:mutation                # Stryker mutation testing (slow)
```

---

## Testing Checklist (Per Feature)

Every new feature must include:

```
□ Unit tests for business logic (≥ 90% coverage on new code)
□ Integration tests for API endpoints (all status codes tested)
□ E2E test for happy path (at minimum)
□ E2E test for critical error path
□ Accessibility test passes (axe-core, 0 violations)
□ Performance budget met (Lighthouse ≥ 95)
□ Security: Zod validation on all inputs
□ Security: Auth + role check tested
□ Security: Rate limiting verified
□ Contract test (response matches Zod schema)
□ data-testid attributes on interactive elements
□ Mock external services in integration tests
□ No flaky tests introduced
□ Test data uses factory (not hardcoded)
```

---

## Tool Cost Summary

| Tool | Category | Cost | Tier | Notes |
|------|----------|------|------|-------|
| Vitest | Unit/Integration | Free | OSS | — |
| Playwright | E2E | Free | OSS | — |
| React Testing Library | Component | Free | OSS | — |
| MSW | API Mocking | Free | OSS | — |
| k6 | Load Testing | Free | OSS (local runs) | Cloud optional ($) |
| Lighthouse CI | Performance | Free | OSS | — |
| Unlighthouse | Full-site Perf | Free | OSS | — |
| @next/bundle-analyzer | Bundle Size | Free | OSS | — |
| Trivy | Dependency Scan | Free | OSS | — |
| Semgrep | SAST | Free | Community rules | Pro rules optional ($) |
| OWASP ZAP | DAST | Free | OSS | — |
| Socket.dev | Supply Chain | Free | Free tier | Covers npm packages |
| axe-core | Accessibility | Free | OSS | — |
| Stryker | Mutation Testing | Free | OSS | — |
| Biome | Lint + Format | Free | OSS | — |
| Ultracite | Biome Preset | Free | OSS | — |
| Husky + lint-staged | Pre-commit | Free | OSS | — |
| @faker-js/faker | Test Data | Free | OSS | — |
| **Meticulous AI** | Visual Regression | Free | Free (<5 devs) | Best zero-effort option |
| **TestSprite** | AI Exploratory | Free | Limited free tier | Drop if quota insufficient |
| **Checkly** | Synthetic Monitor | Free | 5 checks, 10K runs/mo | Complements BetterStack |
| **Total** | — | **$0/month** | **All free tiers** | — |

### Cost Scaling (If RGSS Grows)

| Growth Trigger | Tool to Upgrade | Cost |
|----------------|----------------|------|
| > 5 developers | Meticulous AI → Team plan | ~$50/mo |
| Need cloud load tests | k6 Cloud | ~$30/mo |
| > 100 E2E tests needing cloud run | Playwright Cloud (MS) | Free tier usually enough |
| Need advanced Semgrep rules | Semgrep Pro | ~$40/mo |
| Need coverage tracking with trends | Codecov | Free tier usually enough |

> **Rule:** Stay on free tiers until a genuine pain point forces an upgrade. Don't pre-optimize cost.

---

## Testing Strategy Decision Log

| Decision | Chosen | Rejected | Rationale |
|----------|--------|----------|-----------|
| Test runner | Vitest | Jest | Native ESM, Bun-compatible, 10x faster, same API |
| E2E framework | Playwright | Cypress | Multi-browser, auto-wait, better TypeScript, free parallel |
| Linter + Formatter | Biome + Ultracite | ESLint + Prettier | Single tool, 100x faster, zero-config via Ultracite |
| Visual regression | Meticulous AI | Percy, Chromatic | Zero-effort (records real sessions), free for <5 devs |
| API mocking | MSW | nock, Polly.js | Works in both browser + Node, realistic (network level) |
| Load testing | k6 | Artillery, Gatling | JavaScript-native, local execution, deterministic results |
| Mutation testing | Stryker | None considered | Only credible JS mutation framework |
| Supply chain security | Socket.dev | Snyk | Better at detecting malicious intent vs just CVEs |
| SAST | Semgrep | SonarQube | Lighter, community rules sufficient, no server needed |
| Performance budget | Lighthouse CI | WebPageTest | Free, integrates with GitHub Actions directly |
| Full-site perf | Unlighthouse | Manual Lighthouse | Auto-crawls entire site, catches forgotten pages |
| Synthetic monitoring | Checkly | Datadog Synthetic | Free tier generous (5 checks), Playwright-based |
| AI exploratory | TestSprite | Applitools, QA Wolf | Free tier available, complements (not replaces) E2E |
| Pre-commit hooks | Husky + lint-staged | lefthook, simple-git-hooks | Most widely used, reliable with Bun |
| Test data | @faker-js/faker | chance.js | Larger ecosystem, locale support, actively maintained |
| Testing shape | Diamond | Pyramid | More integration tests needed for API-heavy app |

---

*Document version: 1.0 | Last updated: Session — Principal Test Engineer Review*
*Strategy owner: Solo developer (Phase 1) → Test lead (Phase 2+)*
