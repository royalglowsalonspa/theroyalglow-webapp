/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/web)
 * Module Name  : admin-web-separation.invariants.test
 * Scope        : Static verification of the admin/web separation (Req 9)
 *
 * Description  : Filesystem-level invariants that prove the staff self-service
 *                relocation is complete and the customer site holds only
 *                public/customer code. These are static checks (node:fs), not
 *                runtime behavior tests:
 *                  - no leftover staff page/API directories in apps/web (Req 9.4)
 *                  - no apps/web source references the relocated staff modules
 *                    or removed `/api/staff` paths (Req 9.3)
 *                  - kept public surfaces still exist (Req 6.1, 6.2)
 *                  - the admin/web-separation feature adds no migration of its
 *                    own; the committed canonical baseline is intact
 *                    (Req 9.7, updated for schema-drift-remediation discipline)
 *
 * Tech Stack   : Vitest + node:fs
 * Layer        : Test (static verification)
 ************************************************************/

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

// Resolve the repository root from this file's location:
// apps/web/src/__tests__ -> up four levels -> repo root.
const here = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(here, '../../../..')

const WEB_SRC = join(REPO_ROOT, 'apps', 'web', 'src')

/** Recursively collect non-test TS/TSX source files under a directory. */
function collectSourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      // Skip build output, deps, and the test directory itself (which contains
      // the very strings being grepped for).
      if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '__tests__') {
        continue
      }
      out.push(...collectSourceFiles(full))
      continue
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) {
      continue
    }
    // Exclude test files so their fixtures/strings never trip the grep.
    if (/\.test\.(ts|tsx)$/.test(entry.name)) {
      continue
    }
    out.push(full)
  }
  return out
}

describe('admin-web-separation: no leftover staff surfaces in apps/web (Req 9.4)', () => {
  it('does not contain a staff self-service page directory', () => {
    expect(existsSync(join(WEB_SRC, 'app', 'staff'))).toBe(false)
  })

  it('does not contain a staff self-service API directory', () => {
    expect(existsSync(join(WEB_SRC, 'app', 'api', 'staff'))).toBe(false)
  })

  it('still has no admin page or API directory (prior migration)', () => {
    expect(existsSync(join(WEB_SRC, 'app', 'admin'))).toBe(false)
    expect(existsSync(join(WEB_SRC, 'app', 'api', 'admin'))).toBe(false)
  })
})

describe('admin-web-separation: no dead staff imports/references in apps/web (Req 9.3)', () => {
  // Markers that would only appear if a relocated staff module or removed staff
  // API path were still referenced from the customer site.
  const FORBIDDEN_MARKERS = ['/api/staff', 'staff-leave-panel', 'app/staff/']

  it('no non-test source references a relocated staff module or removed staff API path', () => {
    const offenders: string[] = []
    for (const file of collectSourceFiles(WEB_SRC)) {
      const content = readFileSync(file, 'utf8')
      for (const marker of FORBIDDEN_MARKERS) {
        if (content.includes(marker)) {
          offenders.push(`${file} -> "${marker}"`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})

describe('admin-web-separation: kept public surfaces remain in apps/web (Req 6.1, 6.2)', () => {
  it('retains the public lead-capture page', () => {
    expect(existsSync(join(WEB_SRC, 'app', '(landing)', 'book', 'page.tsx'))).toBe(true)
  })

  it('retains the LeadCaptureForm component', () => {
    expect(existsSync(join(WEB_SRC, 'components', 'lead', 'LeadCaptureForm.tsx'))).toBe(true)
  })
})

describe('admin-web-separation: no admin/web-separation migration (Req 9.7)', () => {
  // NOTE (schema-drift-remediation, task 13.1): the project has since adopted
  // `drizzle-kit generate` with committed SQL migrations. A canonical Baseline_
  // Migration (`0000_*.sql`) now lives in `packages/db/migrations/`. The old
  // `0001_pg_cron_jobs.sql` has been REMOVED (pg_cron retired — all jobs now
  // run as QStash HTTP routes). The admin/web-separation feature itself still
  // introduces NO schema change, so the invariant is: the baseline migration
  // exists and no migration is attributable to the admin/web-separation work.
  const migrationsDir = join(REPO_ROOT, 'packages', 'db', 'migrations')

  const sqlFiles = () =>
    readdirSync(migrationsDir)
      .filter((name) => name.endsWith('.sql'))
      .filter((name) => statSync(join(migrationsDir, name)).isFile())
      .sort()

  it('confirms pg_cron migration has been removed (pg_cron retired)', () => {
    expect(existsSync(migrationsDir)).toBe(true)
    expect(sqlFiles()).not.toContain('0001_pg_cron_jobs.sql')
  })

  it('contains the canonical baseline migration', () => {
    const files = sqlFiles()
    const baseline = files.find((name) => name.startsWith('0000_'))
    expect(baseline).toBeDefined()
  })

  it('introduces no migration attributable to the admin/web-separation feature', () => {
    const offending = sqlFiles().filter((name) =>
      /admin[_-](?:web|subdomain|separation)/i.test(name),
    )
    expect(offending).toEqual([])
  })
})

/************************************************************
 * BUG-CONDITION EXPLORATION TESTS (web-admin-separation-cleanup)
 *
 * Property 1: Bug Condition — Admin-only / duplicated code is misplaced in
 *             apps/web. isBugCondition(X) is TRUE for the units asserted below.
 *
 * These static (filesystem / source-grep) assertions encode the EXPECTED
 * post-fix placement. They are EXPECTED TO FAIL on the current (unfixed) tree:
 * each failure is a counterexample proving the separation defect (misplacement
 * + duplication) is real. After the relocation/de-duplication fix they will
 * pass, validating the fix. Scoped to the concrete units enumerated in the
 * design's relocation inventory (deterministic filesystem state — no random
 * generation).
 *
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 3.6
 ************************************************************/

const ADMIN_SRC = join(REPO_ROOT, 'apps', 'admin', 'src')
const WEB_JOBS_DIR = join(WEB_SRC, 'app', 'api', 'jobs')
const ADMIN_JOBS_DIR = join(ADMIN_SRC, 'app', 'api', 'jobs')
const DEPLOY_PROD_WORKFLOW = join(REPO_ROOT, '.github', 'workflows', 'deploy-prod.yml')
const WEB_PACKAGE_JSON = join(REPO_ROOT, 'apps', 'web', 'package.json')
const WEB_ENQUEUE = join(WEB_SRC, 'lib', 'jobs', 'enqueue.ts')

/** Apps that contain a `src/app/api/jobs/<name>/route.ts` handler. */
function appsContainingJobRoute(name: string): string[] {
  const apps: string[] = []
  if (existsSync(join(WEB_JOBS_DIR, name, 'route.ts'))) {
    apps.push('web')
  }
  if (existsSync(join(ADMIN_JOBS_DIR, name, 'route.ts'))) {
    apps.push('admin')
  }
  return apps
}

describe('admin-web-separation: background jobs must not live in apps/web (Req 2.1, 2.2) [isBugCondition: misplaced]', () => {
  it('does NOT contain a background-jobs API directory in apps/web', () => {
    // FAILS on the unfixed tree: 19 admin-only job handlers are present.
    expect(existsSync(WEB_JOBS_DIR)).toBe(false)
  })
})

describe('admin-web-separation: triggered job routes are defined in exactly one app (Req 2.3, 2.4) [isBugCondition: duplicated]', () => {
  // These two were copied into apps/admin (canonical) but never deleted from
  // apps/web, leaving byte-identical live copies in both apps.
  for (const name of ['noshow-check', 'stale-booking-alert']) {
    it(`"${name}" route exists in exactly one app`, () => {
      // FAILS on the unfixed tree: present in BOTH web and admin.
      expect(appsContainingJobRoute(name)).toEqual(['admin'])
    })
  }
})

describe('admin-web-separation: QStash schedule registration is owned by the admin side (Req 2.2, 3.6) [isBugCondition: misplaced]', () => {
  it('deploy-prod.yml (customer workflow) has NO "Register QStash schedules" step', () => {
    const workflow = readFileSync(DEPLOY_PROD_WORKFLOW, 'utf8')
    // FAILS on the unfixed tree: the web deploy owns the registration step.
    expect(workflow).not.toContain('Register QStash schedules')
  })

  it('apps/web/package.json has NO "register-schedules" script', () => {
    const pkg = JSON.parse(readFileSync(WEB_PACKAGE_JSON, 'utf8')) as {
      scripts?: Record<string, string>
    }
    // FAILS on the unfixed tree: web still owns the registration script.
    expect(pkg.scripts?.['register-schedules']).toBeUndefined()
  })
})

describe('admin-web-separation: web booking enqueue targets the admin origin (Req 2.2, 3.6) [isBugCondition: triggered destination]', () => {
  it('apps/web/src/lib/jobs/enqueue.ts resolves the destination from NEXT_PUBLIC_ADMIN_URL, not NEXT_PUBLIC_APP_URL', () => {
    const enqueue = readFileSync(WEB_ENQUEUE, 'utf8')
    // FAILS on the unfixed tree: enqueue.ts uses NEXT_PUBLIC_APP_URL (customer
    // origin) so the triggered jobs would POST to theroyalglow.in, not the
    // canonical admin job home.
    expect(enqueue).toContain('NEXT_PUBLIC_ADMIN_URL')
    expect(enqueue).not.toContain('NEXT_PUBLIC_APP_URL')
  })
})

/************************************************************
 * FIX-VERIFICATION (web-admin-separation-cleanup, task 3.7)
 *
 * Property 1: Expected Behavior — Admin-only / duplicated code is correctly
 *             placed and de-duplicated. These extend the SAME bug-condition
 *             harness above (design §F): after the relocation/de-duplication
 *             fix, no `apps/web` source references a moved/deleted job lib, the
 *             dead web libs are gone, the kept customer libs/routes remain, and
 *             the canonical 19-job surface + schedule registration resolve on
 *             the admin side against the admin origin.
 *
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 3.6
 ************************************************************/

const WEB_LIB = join(WEB_SRC, 'lib')
const ADMIN_SCHEDULES = join(ADMIN_SRC, 'lib', 'jobs', 'schedules.ts')
const ADMIN_REGISTER_SCRIPT = join(REPO_ROOT, 'apps', 'admin', 'scripts', 'register-schedules.ts')

// The 14 QStash *scheduled* job keys (JOB_SCHEDULES source of truth).
const SCHEDULED_JOB_KEYS = [
  'appointment-reminders',
  'membership-expiry',
  'birthday-emails',
  'membership-usage-nudges',
  'lead-followups',
  'daily-sales-report',
  'weekly-report',
  'gems-expiry-reminder',
  'nightly-sales-summary',
  'membership-auto-expire',
  'offer-auto-expire',
  'gems-auto-expire',
  'session-cleanup',
  'monthly-gst-summary',
] as const

// The 5 QStash *triggered* job routes (enqueued with a delay).
const TRIGGERED_JOB_NAMES = [
  'post-service-followup',
  'membership-expired-notice',
  'invoice-pdf',
  'noshow-check',
  'stale-booking-alert',
] as const

// The 19 canonical job routes = 14 scheduled + 5 triggered.
const ALL_CANONICAL_JOB_ROUTES = [...SCHEDULED_JOB_KEYS, ...TRIGGERED_JOB_NAMES]

describe('admin-web-separation: no references to moved/deleted job libs in apps/web (Req 2.1, 2.3) [Expected Behavior]', () => {
  // Import/module markers for the moved (schedules, reports/slack) or deleted
  // (verify, heartbeat, dispatch) admin-only libs, plus the now-removed web
  // jobs API directory. SCOPED to import specifiers / module paths — NOT raw
  // destination path strings: the booking enqueue legitimately passes job path
  // STRINGS ('/api/jobs/noshow-check', '/api/jobs/stale-booking-alert') to
  // `enqueueJob`, which must remain allowed. `app/api/jobs/` only matches an
  // import FROM the (gone) web jobs API dir, never those `/api/jobs/*` strings.
  const FORBIDDEN_JOB_MARKERS = [
    'app/api/jobs/',
    'lib/jobs/verify',
    'lib/jobs/heartbeat',
    'lib/jobs/schedules',
    'notifications/dispatch',
    'reports/slack',
  ]

  it('no non-test web source imports a moved/deleted job lib or the web jobs API dir', () => {
    const offenders: string[] = []
    for (const file of collectSourceFiles(WEB_SRC)) {
      const content = readFileSync(file, 'utf8')
      for (const marker of FORBIDDEN_JOB_MARKERS) {
        if (content.includes(marker)) {
          offenders.push(`${file} -> "${marker}"`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('still allows the legitimate enqueue destination path STRINGS (regression guard for the marker scope)', () => {
    // The booking route passes these as data to enqueueJob; the markers above
    // MUST NOT forbid them. Confirm they remain present (would catch an
    // over-broad future marker that deleted them).
    const bookingRoute = readFileSync(join(WEB_SRC, 'app', 'api', 'bookings', 'route.ts'), 'utf8')
    expect(bookingRoute).toContain('/api/jobs/stale-booking-alert')
    expect(bookingRoute).toContain('/api/jobs/noshow-check')
  })
})

describe('admin-web-separation: dead/moved web job libs are gone (Req 2.1, 2.3) [Expected Behavior]', () => {
  it('removed the moved admin-only libs from apps/web', () => {
    expect(existsSync(join(WEB_LIB, 'jobs', 'schedules.ts'))).toBe(false)
    expect(existsSync(join(WEB_LIB, 'reports'))).toBe(false)
  })

  it('removed the now-dead web job libs', () => {
    expect(existsSync(join(WEB_LIB, 'jobs', 'verify.ts'))).toBe(false)
    expect(existsSync(join(WEB_LIB, 'jobs', 'heartbeat.ts'))).toBe(false)
    expect(existsSync(join(WEB_LIB, 'notifications', 'dispatch.ts'))).toBe(false)
    expect(existsSync(join(WEB_LIB, 'notifications', 'providers', 'webpush.ts'))).toBe(false)
  })

  it('apps/web/src/lib/jobs retains ONLY enqueue.ts', () => {
    const entries = readdirSync(join(WEB_LIB, 'jobs')).filter((n) => /\.tsx?$/.test(n))
    expect(entries).toEqual(['enqueue.ts'])
  })
})

describe('admin-web-separation: kept customer libs + split routes remain in apps/web (Req 3.5) [Preservation]', () => {
  it('retains the customer-only libs that stay in web', () => {
    expect(existsSync(join(WEB_LIB, 'jobs', 'enqueue.ts'))).toBe(true)
    expect(existsSync(join(WEB_LIB, 'notifications', 'providers', 'email.ts'))).toBe(true)
    expect(existsSync(join(WEB_LIB, 'meta', 'capi.ts'))).toBe(true)
  })

  it('retains the four customer split-route handlers', () => {
    for (const route of ['leads', 'membership', 'offers', 'notifications']) {
      expect(existsSync(join(WEB_SRC, 'app', 'api', route, 'route.ts'))).toBe(true)
    }
  })
})

describe('admin-web-separation: the canonical 19 job routes live in apps/admin (Req 2.1, 2.2, 2.4, 3.6) [admin presence]', () => {
  for (const name of ALL_CANONICAL_JOB_ROUTES) {
    it(`"${name}" route exists under apps/admin/src/app/api/jobs`, () => {
      expect(existsSync(join(ADMIN_JOBS_DIR, name, 'route.ts'))).toBe(true)
    })
  }

  it('admin hosts exactly the 19 canonical job route directories (no extras, no duplicates)', () => {
    const dirs = readdirSync(ADMIN_JOBS_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort()
    expect(dirs).toEqual([...ALL_CANONICAL_JOB_ROUTES].sort())
  })
})

describe('admin-web-separation: register-schedules + JOB_SCHEDULES resolve in admin (Req 2.2, 3.6) [admin presence]', () => {
  it('apps/admin hosts the registration script and the schedules source of truth', () => {
    expect(existsSync(ADMIN_REGISTER_SCRIPT)).toBe(true)
    expect(existsSync(ADMIN_SCHEDULES)).toBe(true)
  })

  it('JOB_SCHEDULES resolves in admin and declares all 14 scheduled jobs at /api/jobs/*', async () => {
    // Dynamic import by absolute file URL — schedules.ts has zero imports and
    // no side effects, so it loads cleanly from the web test project.
    const mod = (await import(pathToFileURL(ADMIN_SCHEDULES).href)) as {
      JOB_SCHEDULES: ReadonlyArray<{ key: string; path: string; cron: string }>
    }
    const schedules = mod.JOB_SCHEDULES
    expect(schedules).toHaveLength(14)

    // Keys match the 14 expected scheduled jobs exactly.
    expect(schedules.map((s) => s.key).sort()).toEqual([...SCHEDULED_JOB_KEYS].sort())

    // Every schedule POSTs to a canonical /api/jobs/<key> path with a cron.
    for (const s of schedules) {
      expect(s.path).toBe(`/api/jobs/${s.key}`)
      expect(s.cron).toMatch(/^[\d*/, \-]+$/)
    }
  })

  it('register-schedules builds the destination origin from NEXT_PUBLIC_APP_URL and reads JOB_SCHEDULES', () => {
    const script = readFileSync(ADMIN_REGISTER_SCRIPT, 'utf8')
    // Origin comes from process.env.NEXT_PUBLIC_APP_URL (fed the admin URL var
    // by deploy-admin-prod.yml) — so the 14 schedules target the admin origin.
    expect(script).toContain('process.env.NEXT_PUBLIC_APP_URL')
    // Consumes the single schedules source of truth.
    expect(script).toMatch(/import\s*\{\s*JOB_SCHEDULES\s*\}\s*from\s*['"][^'"]*schedules['"]/)
    // Destination is `${base}${job.path}` and a --dry preview mode exists.
    expect(script).toContain('${base}${job.path}')
    expect(script).toContain('--dry')
  })
})

describe('admin-web-separation: QStash schedule registration is wired to the admin deploy + origin (Req 2.2, 3.6) [admin presence]', () => {
  const ADMIN_DEPLOY_WORKFLOW = join(REPO_ROOT, '.github', 'workflows', 'deploy-admin-prod.yml')
  const ADMIN_PACKAGE_JSON = join(REPO_ROOT, 'apps', 'admin', 'package.json')

  it('apps/admin/package.json owns the register-schedules script', () => {
    const pkg = JSON.parse(readFileSync(ADMIN_PACKAGE_JSON, 'utf8')) as {
      scripts?: Record<string, string>
    }
    expect(pkg.scripts?.['register-schedules']).toBeDefined()
  })

  it('deploy-admin-prod.yml registers schedules against the admin origin', () => {
    const workflow = readFileSync(ADMIN_DEPLOY_WORKFLOW, 'utf8')
    expect(workflow).toContain('Register QStash schedules')
    expect(workflow).toContain('bun run register-schedules')
    // The registration origin is fed from the admin URL var.
    expect(workflow).toContain('NEXT_PUBLIC_APP_URL: ${{ vars.NEXT_PUBLIC_ADMIN_URL }}')
  })
})
