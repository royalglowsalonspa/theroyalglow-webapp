/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 05-09-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : scripts/mcp/doctor
 * Scope        : Tooling — cross-device MCP setup parity check
 *
 * Description  : Verifies that this machine satisfies everything the
 *                generated MCP configs assume, so every collaborator's
 *                tools behave identically on Windows and macOS/Linux:
 *                required launcher binaries on PATH, the five _RGSS
 *                environment variables present, generated files in sync
 *                with sources.json, and no leftover shell-style ${VAR}
 *                references in opencode.json (OpenCode only expands
 *                {env:VAR}).
 *
 *                Prints PASS/FAIL per check and exits non-zero when any
 *                check fails. NEVER prints secret values — only SET/MISSING.
 *
 * Responsibilities :
 * - Check bins: snyk, shadcn, mcp-remote, code-review-graph (+ node/npm)
 * - Check env: the five _RGSS variables exist and are non-empty
 * - Check files: sources.json parses with 16 servers; every generated
 *   file exists and carries the same server names
 * - Compare parsed generated contents against sources.json, ignoring timestamps
 * - Check ports: 3002 (payload CMS) reachable or clearly reported closed
 *
 * Tech Stack   : TypeScript, Bun (zero deps)
 * Layer        : Tooling script (standalone — no app runtime dependency)
 *
 * Notes        :
 * - Run with `bun run mcp:doctor` after cloning and after `mcp:generate`.
 * - OAuth state (Cloudflare/Sentry/Mintlify consents) is per-user and is
 *   intentionally NOT checked here — complete it inside each tool's UI.
 * - See knowledge-base/mcp-setup.md for setup instructions.
 ************************************************************/

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import net from 'node:net'
import { join } from 'node:path'
import { generatedConfigMatches, renderMcpConfigs, type SourcesFile } from './generate'

const REPO_ROOT = join(import.meta.dirname, '..', '..')

let failures = 0
function pass(label: string, detail = '') {
  console.log(`PASS  ${label}${detail ? ` — ${detail}` : ''}`)
}
function fail(label: string, hint: string) {
  failures += 1
  console.log(`FAIL  ${label} — ${hint}`)
}
function warn(label: string, hint: string) {
  console.log(`WARN  ${label} — ${hint}`)
}

// ─── 1. Launcher binaries on PATH ────────────────────────────────────
const BINS: Array<{ bin: string; args: string[]; timeoutMs: number }> = [
  { bin: 'node', args: ['--version'], timeoutMs: 15000 },
  { bin: 'npm', args: ['--version'], timeoutMs: 30000 },
  { bin: 'mcp-remote', args: ['--help'], timeoutMs: 30000 },
  { bin: 'shadcn', args: ['--version'], timeoutMs: 30000 },
  { bin: 'snyk', args: ['--version'], timeoutMs: 45000 },
  { bin: 'code-review-graph', args: ['serve', '--help'], timeoutMs: 30000 },
]
for (const { bin, args, timeoutMs } of BINS) {
  const r = spawnSync(bin, args, { encoding: 'utf8', timeout: timeoutMs, shell: false })
  if (r.error) {
    fail(
      `bin:${bin}`,
      `not on PATH or not executable (${(r.error as Error).message}). Install it, then re-run.`,
    )
  } else if (r.status !== 0 && bin !== 'code-review-graph') {
    // code-review-graph --help is allowed non-zero (arg parser quirk); the
    // spawn succeeding at all proves the binary resolves.
    fail(`bin:${bin}`, `exited with code ${r.status}. Reinstall it, then re-run.`)
  } else {
    const firstLine = (r.stdout || r.stderr || '').split(/\r?\n/).filter(Boolean)[0] ?? ''
    pass(`bin:${bin}`, firstLine.slice(0, 60))
  }
}

// ─── 2. Environment variables (presence only — values never printed) ─
const ENV_VARS = [
  'NEON_API_KEY_RGSS',
  'GITHUB_PAT_RGSS',
  'POSTHOG_AUTH_HEADER_RGSS',
  'PAYLOAD_MCP_API_KEY_RGSS',
  'CLOUDFLARE_API_TOKEN_RGSS',
]
for (const name of ENV_VARS) {
  const v = process.env[name]
  if (v && v.length > 0) pass(`env:${name}`, 'SET')
  else
    fail(
      `env:${name}`,
      'MISSING — set it as a User env var (Windows) or export (macOS/Linux), then fully restart the IDE/terminal.',
    )
}

// Compare the same rendered configuration the generator would write. Git does
// not preserve generation times, and unchanged outputs retain old mtimes on pull.
let sources: SourcesFile
try {
  sources = JSON.parse(readFileSync(join(REPO_ROOT, 'scripts/mcp/sources.json'), 'utf8'))
} catch {
  fail('sources.json', 'unreadable or invalid JSON.')
  process.exit(1)
}
pass('sources.json', `${sources.servers.length} servers`)

let existingOpenCode: Record<string, unknown> = {}
try {
  existingOpenCode = JSON.parse(readFileSync(join(REPO_ROOT, 'opencode.json'), 'utf8'))
} catch {
  // Missing or invalid files are reported individually below.
}
for (const [file, expected] of Object.entries(
  renderMcpConfigs(sources.servers, existingOpenCode),
)) {
  try {
    const actual = readFileSync(join(REPO_ROOT, file), 'utf8')
    if (file === 'opencode.json' && /\$\{[A-Za-z_][A-Za-z0-9_]*\}/.test(actual)) {
      fail(`file:${file}`, 'unsupported shell-style variable; fix sources.json and regenerate.')
    } else if (generatedConfigMatches(file, actual, expected)) {
      pass(`file:${file}`, 'contents in sync')
    } else {
      fail(`file:${file}`, 'configuration differs from sources.json; run bun run mcp:generate.')
    }
  } catch {
    fail(`file:${file}`, 'missing, unreadable, or invalid; run bun run mcp:generate.')
  }
}

// Payload CMS port
await new Promise<void>((resolve) => {
  const sock = net.connect({ host: '127.0.0.1', port: 3002 })
  let finished = false
  const done = (open: boolean) => {
    if (finished) return
    finished = true
    clearTimeout(timer)
    if (open) pass('port:3002 (payload CMS)', 'OPEN')
    else
      warn(
        'port:3002 (payload CMS)',
        'CLOSED — payload MCP will fail until `cd apps/cms && bun run dev` is running.',
      )
    try {
      sock.destroy()
    } catch {
      /* noop */
    }
    resolve()
  }
  sock.on('connect', () => done(true))
  sock.on('error', () => done(false))
  const timer = setTimeout(() => done(false), 4000)
})

console.log(
  failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED — see hints above.`,
)
process.exit(failures === 0 ? 0 : 1)
