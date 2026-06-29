/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 29-06-2026 & Updated - 29-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : scripts/provision-betterstack
 * Scope        : Ops — BetterStack uptime + status page provisioning
 *
 * Description  : Idempotently provisions the BetterStack Uptime resources for
 *                Royal Glow Salon & Spa via the Uptime API v2:
 *                  1. 10 HTTP monitors (the 10 free-tier slots from
 *                     observability.md)
 *                  2. 5 job heartbeats (nightly sales, membership expiry,
 *                     session cleanup, pprd sync, appointment reminders)
 *                  3. The public status page bound to the custom domain
 *                     status.theroyalglow.in, with the monitors wired in as
 *                     status-page resources with friendly public names.
 *
 *                Re-runnable: existing resources are matched (monitors by url,
 *                heartbeats by name, status page by subdomain, resources by
 *                monitor id) and skipped/reused rather than duplicated.
 *
 * Tech Stack   : TypeScript, Bun (global fetch — zero deps)
 * Layer        : Ops script (standalone — independent of the app db/env)
 *
 * Dependencies : none (uses Bun's global fetch)
 *
 * Notes        :
 * - Auth: set BETTER_STACK_API_TOKEN to an Uptime API token
 *   (Settings -> API tokens -> Uptime). This is NOT the log-drain
 *   BETTER_STACK_TOKEN source token.
 * - If the token is a GLOBAL token, also set BETTER_STACK_TEAM_NAME so the
 *   created resources are owned by the right team.
 * - SAFE BY DEFAULT: prints the plan and mutates NOTHING unless you pass
 *   --apply (or set BETTERSTACK_APPLY=1). The custom domain only goes live
 *   after you add the CNAME printed at the end.
 ************************************************************/

const API = 'https://uptime.betterstack.com/api/v2'

const TOKEN = process.env.BETTER_STACK_API_TOKEN
const TEAM_NAME = process.env.BETTER_STACK_TEAM_NAME
const APPLY = process.argv.includes('--apply') || process.env.BETTERSTACK_APPLY === '1'

if (!TOKEN) {
  console.error(
    '❌ BETTER_STACK_API_TOKEN is required. Create one at ' +
      'https://betterstack.com/settings/api-tokens (Uptime API token).',
  )
  process.exit(1)
}

// ─── Config ──────────────────────────────────────────────────────
const DOMAIN = 'theroyalglow.in'
const STATUS_SUBDOMAIN = 'theroyalglow' // -> theroyalglow.betteruptime.com
const STATUS_CUSTOM_DOMAIN = `status.${DOMAIN}`
const CNAME_TARGET = 'statuspage.betteruptime.com'

type MonitorDef = {
  /** internal monitor name (BetterStack dashboard) */
  pronounceable_name: string
  /** friendly label shown publicly on the status page */
  public_name: string
  url: string
  monitor_type: 'status' | 'expected_status_code' | 'keyword'
  required_keyword?: string
  expected_status_codes?: number[]
}

// The 10 free-tier monitors from knowledge-base/observability.md.
// The DB/Ably/Redis/R2 probes ride on the health endpoint via ?probe=.
const MONITORS: MonitorDef[] = [
  {
    pronounceable_name: 'Homepage',
    public_name: 'Website',
    url: `https://${DOMAIN}`,
    monitor_type: 'status',
  },
  {
    pronounceable_name: 'Booking dialog (GMB)',
    public_name: 'Online booking',
    url: `https://${DOMAIN}/?book=1&utm_source=gmb`,
    monitor_type: 'status',
  },
  {
    pronounceable_name: 'Booking dialog (walk-in QR)',
    public_name: 'In-store QR booking',
    url: `https://${DOMAIN}/?book=1&utm_source=walkin`,
    monitor_type: 'status',
  },
  {
    pronounceable_name: 'Campaign lead page',
    public_name: 'Campaign landing page',
    url: `https://${DOMAIN}/book`,
    monitor_type: 'status',
  },
  {
    pronounceable_name: 'API health',
    public_name: 'API',
    url: `https://${DOMAIN}/api/health`,
    monitor_type: 'expected_status_code',
    expected_status_codes: [200],
  },
  {
    pronounceable_name: 'Payload CMS',
    public_name: 'Content (CMS)',
    url: `https://cms.${DOMAIN}`,
    monitor_type: 'status',
  },
  {
    pronounceable_name: 'Neon DB probe',
    public_name: 'Database',
    url: `https://${DOMAIN}/api/health?probe=db`,
    monitor_type: 'keyword',
    required_keyword: 'ok',
  },
  {
    pronounceable_name: 'Ably probe',
    public_name: 'Realtime',
    url: `https://${DOMAIN}/api/health?probe=ably`,
    monitor_type: 'keyword',
    required_keyword: 'ok',
  },
  {
    pronounceable_name: 'Upstash Redis probe',
    public_name: 'Cache',
    url: `https://${DOMAIN}/api/health?probe=redis`,
    monitor_type: 'keyword',
    required_keyword: 'ok',
  },
  {
    pronounceable_name: 'Cloudflare R2 probe',
    public_name: 'File storage',
    url: `https://${DOMAIN}/api/health?probe=r2`,
    monitor_type: 'keyword',
    required_keyword: 'ok',
  },
]

type HeartbeatDef = { name: string; period: number; grace: number }

// The 5 scheduled-job heartbeats from observability.md.
const HEARTBEATS: HeartbeatDef[] = [
  { name: 'Nightly sales / GST / offer / gems', period: 86_400, grace: 3_600 },
  { name: 'Membership auto-expire + alerts', period: 86_400, grace: 3_600 },
  { name: 'Session cleanup (weekly)', period: 604_800, grace: 7_200 },
  { name: 'Prod -> pprd sync (GitHub Actions)', period: 86_400, grace: 3_600 },
  { name: 'Appointment reminders (15 min)', period: 900, grace: 300 },
]

// ─── BetterStack response shapes (only the fields we read) ───────
type BSEntity = { id: string; attributes: Record<string, unknown> }
type BSSingle = { data: BSEntity }
type BSList = { data?: BSEntity[]; pagination?: { next?: string | null } }

// ─── HTTP helper ─────────────────────────────────────────────────
async function api(method: string, path: string, body?: unknown): Promise<BSSingle> {
  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
  }
  if (body !== undefined) init.body = JSON.stringify(body)
  const res = await fetch(`${API}${path}`, init)
  const text = await res.text()
  const json = (text ? JSON.parse(text) : {}) as BSSingle
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status} ${res.statusText}: ${text}`)
  }
  return json
}

/** GET every page of a paginated collection, returning the merged `data`. */
async function listAll(path: string): Promise<BSEntity[]> {
  const out: BSEntity[] = []
  let next: string | null = `${API}${path}`
  while (next) {
    const res = await fetch(next, {
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    })
    if (!res.ok) throw new Error(`GET ${next} -> ${res.status}: ${await res.text()}`)
    const json = (await res.json()) as BSList
    out.push(...(json.data ?? []))
    next = json.pagination?.next ?? null
  }
  return out
}

function withTeam<T extends Record<string, unknown>>(body: T): T {
  return TEAM_NAME ? ({ ...body, team_name: TEAM_NAME } as T) : body
}

// ─── Provisioners ────────────────────────────────────────────────
async function ensureMonitors(existing: BSEntity[]): Promise<Map<string, string>> {
  const byUrl = new Map<string, BSEntity>(existing.map((m) => [String(m.attributes?.url), m]))
  const ids = new Map<string, string>() // url -> monitor id

  for (const m of MONITORS) {
    const found = byUrl.get(m.url)
    if (found) {
      ids.set(m.url, found.id)
      console.log(`  ✓ monitor exists: ${m.pronounceable_name} (#${found.id})`)
      continue
    }
    if (!APPLY) {
      console.log(`  + would create monitor: ${m.pronounceable_name} -> ${m.url}`)
      continue
    }
    const body = withTeam({
      monitor_type: m.monitor_type,
      url: m.url,
      pronounceable_name: m.pronounceable_name,
      check_frequency: 180, // free tier: 3 min
      ...(m.required_keyword ? { required_keyword: m.required_keyword } : {}),
      ...(m.expected_status_codes ? { expected_status_codes: m.expected_status_codes } : {}),
      email: false,
      push: true,
    })
    const created = await api('POST', '/monitors', body)
    ids.set(m.url, created.data.id)
    console.log(`  + created monitor: ${m.pronounceable_name} (#${created.data.id})`)
  }
  return ids
}

async function ensureHeartbeats(): Promise<void> {
  const existing = await listAll('/heartbeats')
  const byName = new Map<string, BSEntity>(existing.map((h) => [String(h.attributes?.name), h]))

  for (const h of HEARTBEATS) {
    if (byName.has(h.name)) {
      console.log(`  ✓ heartbeat exists: ${h.name}`)
      continue
    }
    if (!APPLY) {
      console.log(`  + would create heartbeat: ${h.name} (period ${h.period}s, grace ${h.grace}s)`)
      continue
    }
    const created = await api(
      'POST',
      '/heartbeats',
      withTeam({ name: h.name, period: h.period, grace: h.grace }),
    )
    const url = created.data?.attributes?.url
    console.log(`  + created heartbeat: ${h.name}`)
    if (typeof url === 'string') console.log(`      URL: ${url}`)
  }
}

async function ensureStatusPage(): Promise<string | null> {
  const pages = await listAll('/status-pages')
  const page = pages.find(
    (p) =>
      p.attributes?.subdomain === STATUS_SUBDOMAIN ||
      p.attributes?.custom_domain === STATUS_CUSTOM_DOMAIN,
  )

  if (page) {
    console.log(`  ✓ status page exists (#${page.id}) subdomain=${page.attributes?.subdomain}`)
    return page.id
  }
  if (!APPLY) {
    console.log(
      `  + would create status page: ${STATUS_CUSTOM_DOMAIN} (subdomain ${STATUS_SUBDOMAIN})`,
    )
    return null
  }

  const created = await api(
    'POST',
    '/status-pages',
    withTeam({
      company_name: 'Royal Glow Salon & Spa',
      company_url: `https://${DOMAIN}`,
      contact_url: `mailto:hello@${DOMAIN}`,
      subdomain: STATUS_SUBDOMAIN,
      custom_domain: STATUS_CUSTOM_DOMAIN,
      timezone: 'Chennai', // Rails TZ name for IST (Asia/Kolkata)
      history: 90,
      subscribable: true,
      design: 'v2',
      theme: 'light',
      layout: 'horizontal',
      automatic_reports: true,
    }),
  )
  console.log(`  + created status page (#${created.data.id})`)
  return created.data.id
}

async function ensureResources(
  statusPageId: string,
  monitorIds: Map<string, string>,
): Promise<void> {
  const existing = await listAll(`/status-pages/${statusPageId}/resources`)
  const present = new Set(existing.map((r) => String(r.attributes?.resource_id)))
  let position = existing.length
  for (const m of MONITORS) {
    const monitorId = monitorIds.get(m.url)
    if (!monitorId) {
      console.log(`  · skip resource (monitor not created yet in dry-run): ${m.public_name}`)
      continue
    }
    if (present.has(String(monitorId))) {
      console.log(`  ✓ resource exists: ${m.public_name}`)
      continue
    }
    if (!APPLY) {
      console.log(`  + would add resource: ${m.public_name} (monitor #${monitorId})`)
      continue
    }
    await api('POST', `/status-pages/${statusPageId}/resources`, {
      resource_id: monitorId,
      resource_type: 'Monitor',
      public_name: m.public_name,
      widget_type: 'response_times',
      position: position++,
    })
    console.log(`  + added resource: ${m.public_name}`)
  }
}

// ─── Main ────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log(`\n🩺 BetterStack provisioning for ${STATUS_CUSTOM_DOMAIN}`)
  console.log(
    APPLY
      ? '   MODE: APPLY (creating resources)\n'
      : '   MODE: DRY-RUN (no changes — pass --apply to create)\n',
  )

  console.log('Monitors:')
  const existingMonitors = await listAll('/monitors')
  const monitorIds = await ensureMonitors(existingMonitors)

  console.log('\nHeartbeats:')
  await ensureHeartbeats()

  console.log('\nStatus page:')
  const statusPageId = await ensureStatusPage()

  if (statusPageId) {
    console.log('\nStatus page resources:')
    await ensureResources(statusPageId, monitorIds)
  }

  console.log('\n─────────────────────────────────────────────')
  console.log('DNS — point the custom domain at BetterStack:')
  console.log(`  CNAME  ${STATUS_CUSTOM_DOMAIN}.  ->  ${CNAME_TARGET}`)
  console.log('  (Cloudflare DNS: add the record DNS-only / grey cloud, not proxied.)')
  if (!APPLY) {
    console.log('\nRe-run with --apply once the plan looks right.')
  } else {
    console.log(
      `\n✅ Done. Status page: https://${STATUS_CUSTOM_DOMAIN} (live after the CNAME propagates).`,
    )
  }
  console.log('')
}

main().catch((err) => {
  console.error('❌ Provisioning failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
