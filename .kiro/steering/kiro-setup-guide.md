# Kiro CLI + IDE Setup Guide — Royal Glow Salon & Spa

## The Verdict: Use BOTH Kiro IDE + Kiro CLI Together

For a project of this scale (38 tables, 104 pages, 35 APIs, 19 jobs, monorepo), **you need both tools working together** as a multi-agent development system:

| Tool | Best For | When to Use |
|------|----------|-------------|
| **Kiro IDE** (VS Code extension) | Interactive coding, debugging, specs, visual feedback, file browsing | Day-to-day coding, reviewing code, writing specs, UI work |
| **Kiro CLI** (`kiro` in terminal) | Autonomous multi-file generation, large refactors, scaffolding entire modules | Generating entire features, running tasks, bulk file creation |

### Why Not Just One?

| Scenario | Use This |
|----------|----------|
| "Generate the entire booking API + DB schema + types" | **Kiro CLI** (autonomous, touches 10+ files) |
| "Fix this one component's styling" | **Kiro IDE** (interactive, see changes live) |
| "Scaffold Phase 0 monorepo structure" | **Kiro CLI** (creates 30+ files in one shot) |
| "Debug why this API returns 500" | **Kiro IDE** (read logs, inspect, iterate) |
| "Generate all 38 Drizzle schema files" | **Kiro CLI** (bulk generation) |
| "Write a spec for the membership feature" | **Kiro IDE** (specs panel, iterative) |
| "Run the full implementation plan Phase 1-3" | **Kiro CLI** (multi-agent, autonomous) |

---

## Step 1: Kiro CLI Installation & Config

You said you have Kiro CLI installed. Verify:

```bash
# Check version
kiro --version

# Authenticate (if not already)
kiro auth login
```

---

## Step 2: Project Directory Setup

```bash
# Create your actual implementation repo (separate from this docs repo)
mkdir rgss_solutions
cd rgss_solutions

# Initialize git
git init
git remote add origin git@github.com:royalglowsalonspa/rgss_solutions.git
```

---

## Step 3: Install AI Agent Skills (Run These First)

These skills teach Kiro HOW to write code for your specific stack. Run in your project root:

```bash
# ═══════════════════════════════════════════════════════
# PRIORITY 0: Design & Quality (Install BEFORE coding)
# ═══════════════════════════════════════════════════════

# Premium UI methodology — research-first design
npx skills add https://github.com/referodesign/refero_skill

# Anti-AI-slop — stops generic boring UI generation
npx skills add https://github.com/Leonxlnx/taste-skill

# Emil Kowalski — UI polish, animations, perceived performance
npx skills add emilkowalski/skill

# Hallmark — anti-slop design + 65 pre-ship quality gates
npx skills add Nutlope/hallmark

# ═══════════════════════════════════════════════════════
# PRIORITY 1: Framework Skills (Core Stack)
# ═══════════════════════════════════════════════════════

# Official Next.js skills — RSC, App Router, async APIs, metadata
npx skills add vercel-labs/next-skills

# Official Vercel agent skills — React, Tailwind, deployment
npx skills add vercel-labs/agent-skills

# Better Auth best practices
npx skills add better-auth/skills

# React Doctor — security, performance, architecture scan
npx skills add millionco/react-doctor

# ═══════════════════════════════════════════════════════
# PRIORITY 2: Engineering Methodology
# ═══════════════════════════════════════════════════════

# Matt Pocock — grill-with-docs, TDD, domain modeling, PRDs
npx skills add mattpocock/skills

# Anthony Fu — TypeScript, tooling patterns
npx skills add antfu/skills

# Anthropic official skills
npx skills add anthropics/skills

# ═══════════════════════════════════════════════════════
# PRIORITY 3: Platform-Specific
# ═══════════════════════════════════════════════════════

# Cloudflare, React, Tailwind v4 patterns
npx skills add jezweb/claude-skills

# Production-ready full-stack patterns
npx skills add secondsky/claude-skills
```

After running these, verify:
```bash
npx skills list
```

---

## Step 4: Copy Steering Files to Implementation Repo

The steering files we created in this docs repo need to be in your implementation repo too:

```bash
# From your implementation repo root (rgss_solutions/)
mkdir -p .kiro/steering

# Copy from docs repo (adjust path as needed)
cp /path/to/rgss_solutions_kiro/.kiro/steering/*.md .kiro/steering/
```

Or recreate them — they're already pushed to GitHub at:
`https://github.com/royalglowsalonspa/rgss_solutions_kiro/tree/feat/kiro-steering-setup/.kiro/steering/`

---

## Step 5: Multi-Agent Workflow (How to Build This Project)

### The 3-Agent Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    YOUR DEVELOPMENT WORKFLOW                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────────┐     │
│  │  AGENT 1     │     │  AGENT 2     │     │  AGENT 3         │     │
│  │  Kiro CLI    │     │  Kiro IDE    │     │  Kiro Web/Cloud  │     │
│  │  (Terminal)  │     │  (VS Code)   │     │  (Browser)       │     │
│  ├──────────────┤     ├──────────────┤     ├──────────────────┤     │
│  │ Autonomous   │     │ Interactive  │     │ Planning/Review  │     │
│  │ generation   │     │ coding       │     │ + PR creation    │     │
│  │              │     │              │     │                  │     │
│  │ • Scaffold   │     │ • Debug      │     │ • Write specs    │     │
│  │ • Bulk gen   │     │ • Fix bugs   │     │ • Review code    │     │
│  │ • Full feats │     │ • UI polish  │     │ • Plan phases    │     │
│  │ • Migrations │     │ • Test       │     │ • Create PRs     │     │
│  └──────┬───────┘     └──────┬───────┘     └────────┬─────────┘     │
│         │                    │                       │               │
│         └────────────────────┼───────────────────────┘               │
│                              │                                        │
│                    ┌─────────▼─────────┐                             │
│                    │  SHARED CONTEXT    │                             │
│                    │  .kiro/steering/   │                             │
│                    │  .kiro/skills/     │                             │
│                    │  Git repository    │                             │
│                    └───────────────────┘                              │
└─────────────────────────────────────────────────────────────────────┘
```

### How the Agents Collaborate

| Phase | Agent | Command / Action | Output |
|-------|-------|-----------------|--------|
| **Plan** | Kiro Web (here) | Discuss architecture, review docs | Steering files, specs |
| **Scaffold** | Kiro CLI | `kiro "Scaffold Phase 0 monorepo"` | 30+ files created |
| **Implement** | Kiro CLI | `kiro "Implement booking API endpoints"` | Full feature code |
| **Polish** | Kiro IDE | Open in VS Code, use Kiro panel | UI tweaks, bug fixes |
| **Review** | Kiro IDE | Use specs panel, run tests | Quality gate |
| **Deploy** | Kiro CLI | `kiro "Set up CI/CD pipeline"` | GitHub Actions |

---

## Step 6: Kiro CLI Commands for Each Phase

### Phase 0: Scaffolding (Day 1)

```bash
# In your rgss_solutions/ directory:

kiro "Scaffold the monorepo using Turborepo + Bun workspaces. 
Create apps/web (Next.js 16), packages/db (Drizzle ORM), 
packages/business (pure logic), packages/types (Zod schemas), 
packages/errors (AppError), packages/logger. 
Follow .kiro/steering/project-overview.md structure exactly."

# Then:
kiro "Set up Tailwind CSS v4 with design tokens, shadcn/ui, 
and Biome for linting in apps/web. Follow coding-standards.md."

# Then:
kiro "Create env.ts with t3-env validation for all 55 
environment variables listed in the steering files."
```

### Phase 1: Database & Auth (Day 2-3)

```bash
kiro "Create all Drizzle ORM schema files in packages/db/schema/. 
Include all 38 tables with enums, indexes, constraints. 
Follow database.md steering file exactly — paise for money, 
nanoid for IDs, timestamptz for timestamps."

kiro "Set up Better Auth with Google OAuth, RBAC plugin (6 roles), 
session table in Neon. Create the auth API route, middleware, 
sign-in page, and onboarding flow."

kiro "Create seed script with branch data, service categories, 
services, SPA tiers, and test user accounts for each role."
```

### Phase 2: Customer Pages (Day 4-7)

```bash
kiro "Build the customer layout (header, footer, mobile nav) 
and homepage with hero section, service highlights, and 
Book Now CTA. Use shadcn/ui + Tailwind v4. Mobile-first. 
Follow the design specs in design/homepage-services.md."

kiro "Build the 4-step booking dialog as a modal over the 
homepage. Step 1: date+slot, Step 2: category select, 
Step 3: service multi-select, Step 4: summary. Include 
deep-link support for ?book=1&utm_source=gmb."

kiro "Create all booking API routes: GET /api/services, 
GET /api/availability, POST /api/bookings, 
POST /api/bookings/[id]/cancel, POST /api/bookings/[id]/reschedule. 
Follow the thin API pattern from coding-standards.md."
```

### Phase 3: Admin Portal (Day 8-12)

```bash
kiro "Build the admin layout with sidebar navigation, 
role-based menu items, and RBAC middleware. Dashboard page 
showing today's bookings, revenue, pending actions."

kiro "Build admin booking management: list page with filters 
(status/date/staff/type), detail page with approve/reject/assign, 
and the completion flow that generates invoice + awards gems."

kiro "Implement invoice generation: GST calculation (18% inclusive), 
PDF generation, R2 upload, email via Resend. All in 
packages/business/invoicing/ with proper paise math."
```

### Phase 4-10: Continue the Pattern

```bash
# Each phase follows the same pattern:
kiro "Implement [feature] following the steering files. 
Reference: [specific .md file for context]"
```

---

## Step 7: Kiro IDE Specs Workflow (for Complex Features)

For complex features, use **Kiro IDE's Specs panel** before coding:

1. Open project in VS Code with Kiro extension
2. Click **Specs** in Kiro panel
3. Create a new spec:
   - **Requirements** → Kiro generates user stories from your prompt
   - **Design** → Kiro creates technical design (you review & iterate)
   - **Tasks** → Kiro breaks into implementation tasks
4. Click **Implement** → Kiro codes each task sequentially

**Best specs candidates for this project:**
- Booking system (complex state machine)
- Invoice generation (GST math, PDF, email)
- Membership session tracking
- Lead pipeline with Meta CAPI
- No-show escalation logic

---

## Step 8: Multi-Agent Session Example (Full Day)

```
Morning (Planning — Kiro Web/CLI):
  └── kiro "Review implementation-tasks.md, what's next?"
  └── kiro "Generate the database migration for Phase 1.1"

Mid-day (Bulk Implementation — Kiro CLI):
  └── kiro "Implement all 3 booking API endpoints with tests"
  └── kiro "Create the booking dialog component (4 steps)"

Afternoon (Polish — Kiro IDE):
  └── Open VS Code, review generated code
  └── Use Kiro chat: "Fix the mobile layout on step 2"
  └── Use Kiro chat: "Add loading states to the booking form"
  └── Run: npx vitest --run (verify tests pass)

Evening (Deploy — Kiro CLI):
  └── kiro "Create GitHub Actions CI workflow"
  └── kiro "Push to dev branch and create PR"
```

---

## Step 9: Skills That Kiro Auto-Activates

Once installed, these skills activate **automatically** based on context:

| When You're Working On... | Skills That Activate |
|--------------------------|---------------------|
| Any `.tsx` component | refero-design, taste-skill, hallmark, nextjs-developer |
| API routes | vercel-agent-skills, better-auth |
| Drizzle schemas | (custom skill we'll create below) |
| Tailwind styling | emil-kowalski, taste-skill |
| Architecture decisions | grill-with-docs, mattpocock |
| React components | react-doctor |

---

## Step 10: Key Kiro CLI Tips

### Use `--model` for Different Tasks

```bash
# Complex architecture (use strongest model)
kiro --model claude-sonnet-4 "Design the booking state machine"

# Bulk generation (fast model is fine)  
kiro "Generate all 38 schema files"

# Quick fixes
kiro "Fix the TypeScript error in booking.ts"
```

### Use Specs for Complex Features

```bash
# In Kiro IDE — create spec FIRST, then implement
# Specs panel → New Spec → "Booking System"
# → Requirements → Design → Tasks → Implement
```

### Use Hooks for Automation

Create `.kiro/hooks/` for automatic actions:

```
.kiro/hooks/
├── pre-commit.md      ← "Run biome check before commit"
├── post-generate.md   ← "After generating files, run typecheck"
└── on-error.md        ← "When build fails, suggest fixes"
```

---

## Summary: Your Development Stack

```
┌─────────────────────────────────────────────────────────────┐
│  DAILY WORKFLOW                                               │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  1. PLAN    → Kiro Web (this browser) or Kiro IDE Specs      │
│  2. BUILD   → Kiro CLI (bulk autonomous generation)          │
│  3. POLISH  → Kiro IDE (interactive, visual, debugging)      │
│  4. TEST    → Terminal: npx vitest --run && npx playwright   │
│  5. REVIEW  → Kiro IDE + Git diff + PR review                │
│  6. DEPLOY  → Kiro CLI: CI/CD setup + push                   │
│                                                               │
│  SHARED BRAIN:                                                │
│  • .kiro/steering/ (5 files — project rules)                 │
│  • .kiro/skills/   (installed skills — HOW to code)          │
│  • docs repo       (this repo — WHY and WHAT)                │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Quick Start Checklist

```bash
# 1. Create implementation repo
mkdir rgss_solutions && cd rgss_solutions && git init

# 2. Copy steering files
mkdir -p .kiro/steering
# (copy from docs repo or GitHub PR #19)

# 3. Install all skills (run each line)
npx skills add https://github.com/referodesign/refero_skill
npx skills add https://github.com/Leonxlnx/taste-skill
npx skills add emilkowalski/skill
npx skills add Nutlope/hallmark
npx skills add vercel-labs/next-skills
npx skills add vercel-labs/agent-skills
npx skills add better-auth/skills
npx skills add millionco/react-doctor
npx skills add mattpocock/skills
npx skills add antfu/skills
npx skills add anthropics/skills
npx skills add jezweb/claude-skills
npx skills add secondsky/claude-skills

# 4. Verify
npx skills list

# 5. Start Phase 0
kiro "Scaffold the complete monorepo following .kiro/steering/project-overview.md"
```

---

## Estimated Timeline (Solo Dev + Multi-Agent)

| Phase | Duration | What Gets Built |
|-------|----------|----------------|
| Phase 0 | 1 day | Monorepo scaffold, configs, tooling |
| Phase 1 | 2-3 days | All 38 DB tables, auth, seed data |
| Phase 2 | 4-5 days | Customer pages, booking system, profile |
| Phase 3 | 4-5 days | Admin portal, billing, invoicing |
| Phase 4 | 3-4 days | CRM, leads, memberships, loyalty |
| Phase 5 | 3-4 days | Scheduling, notifications, offers |
| Phase 6 | 2-3 days | Background jobs, automation |
| Phase 7 | 2-3 days | SEO, PWA, polish |
| Phase 8 | 2 days | CMS, blog |
| Phase 9 | 2-3 days | Testing, CI/CD |
| Phase 10 | 1-2 days | Observability, launch |
| **TOTAL** | **~4-5 weeks** | Full production app |

Without AI agents this would take 4-6 months. With Kiro CLI + IDE + Skills, target **4-5 weeks**.
