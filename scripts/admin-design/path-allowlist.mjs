#!/usr/bin/env node
/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp
 * Module Name  : path-allowlist
 * Scope        : CI static gate (admin-portal-redesign · task 11.4)
 *
 * Description  : Fails (exit 1) when an admin-portal-redesign diff touches a
 *                PROTECTED (out-of-bounds) path. The redesign is a
 *                presentation-layer effort ONLY (Req 16.1–16.3, 16.6–16.8):
 *                it must NOT change the data model, API request/response
 *                contracts, the RBAC access-control logic, or the committed
 *                drift fingerprint reference.
 *
 *                Mirrors the cutover-guards migration-diff pattern in
 *                .github/workflows/ci.yml — it inspects the git diff vs the
 *                base branch (BASE_SHA) and is pragmatic by design: it only
 *                FAILS when a protected path is modified ALONGSIDE admin
 *                presentation changes. A PR that legitimately touches a
 *                protected path on its own (e.g. a real schema migration or
 *                an API change made deliberately outside this redesign) is
 *                NOT this gate's concern and passes here — the drift-gate and
 *                cutover-guards jobs own those broader disciplines.
 *
 *                FORMATTING-ONLY protected edits are also allowed: a repo-wide
 *                formatter/linter migration (e.g. Biome v1 -> v2) reorders
 *                imports and re-indents every file, protected ones included,
 *                without changing behaviour. Such a diff cannot be split away,
 *                because the per-app lint job checks the whole source tree at
 *                once and a half-formatted tree fails it.
 *
 *                "Formatting-only" is decided by PARSING, not by diffing text:
 *                each side is processed by the repository's pinned Biome
 *                formatter and import organizer. Indentation, line wrapping,
 *                quote style, semicolons, trailing commas and import order all
 *                wash out, while comments and any added, removed or edited
 *                statement still fail the gate. JSON is compared by key-sorted
 *                re-serialisation; unknown file types fall back to strict byte
 *                comparison.
 *
 * Protected paths (DENYLIST — Req 16.2, 16.3, 16.8):
 *   • packages/db/schema/**          — DB schema (declared location)
 *   • packages/db/src/schema/**      — DB schema (actual location)
 *   • packages/db/migrations/**      — generated migration history
 *   • apps/admin/src/app/api/ (route.ts / route.tsx)
 *                                    — admin API request/response CONTRACTS
 *   • apps/admin/src/lib/rbac.ts     — RBAC access-control logic
 *   • packages/db/scripts/drift/canonical-fingerprint.reference.json
 *                                    — committed drift fingerprint reference
 *
 * Admin presentation paths (the redesign's permitted surface — Req 16.1):
 *   • apps/admin/src/components/**
 *   • apps/admin/src/app/**  (EXCLUDING apps/admin/src/app/api/**)
 *   • apps/admin/src/lib/admin/**
 *   • apps/admin/app/**  /  apps/admin/components/**  (legacy locations)
 *
 * Decision matrix:
 *   presentation? │ protected?          │ result
 *   ──────────────┼─────────────────────┼─────────────────────────────────
 *        no       │        any          │ PASS (not a redesign diff)
 *        yes      │        no           │ PASS (clean presentation-only)
 *        yes      │ formatting-only     │ PASS (no semantic change; noted)
 *        yes      │ semantic change     │ FAIL (reached past its boundary)
 *
 * Base ref resolution (in order):
 *   1. --base <ref> CLI argument
 *   2. BASE_SHA environment variable (set by CI from the PR base SHA)
 *   3. origin/<default> merge-base, falling back to HEAD~1 for local runs
 *
 * Diff command  : git diff --name-only "<base>"...HEAD   (three-dot, mirrors
 *                 the cutover-guards migration-diff step). Locally, uncommitted
 *                 staged + working-tree changes are also folded in so the gate
 *                 is useful before committing.
 *
 * Usage        : node scripts/admin-design/path-allowlist.mjs
 *                node scripts/admin-design/path-allowlist.mjs --base origin/dev
 *                BASE_SHA=<sha> node scripts/admin-design/path-allowlist.mjs
 *                bun run check:admin-path-allowlist
 * Dependencies : node:child_process, node:fs, node:module, @biomejs/biome
 ************************************************************/
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const nodeRequire = createRequire(import.meta.url)
const BIOME_BIN = nodeRequire.resolve('@biomejs/biome/bin/biome')

// ---------------------------------------------------------------------------
// Protected-path predicates (DENYLIST). Each receives a forward-slashed,
// repo-relative path and returns the human-readable reason it is protected,
// or null when the path is not protected.
// ---------------------------------------------------------------------------
const PROTECTED = [
  {
    reason: 'DB schema (Req 16.2)',
    match: (p) => p.startsWith('packages/db/schema/') || p.startsWith('packages/db/src/schema/'),
  },
  {
    reason: 'DB migration history (Req 16.2, 16.8)',
    match: (p) => p.startsWith('packages/db/migrations/'),
  },
  {
    reason: 'admin API request/response contract (Req 16.2, 16.4)',
    match: (p) => p.startsWith('apps/admin/src/app/api/') && /\/route\.tsx?$/.test(p),
  },
  {
    reason: 'RBAC access-control logic (Req 16.3)',
    match: (p) => p === 'apps/admin/src/lib/rbac.ts',
  },
  {
    reason: 'committed drift fingerprint reference (Req 16.8)',
    match: (p) => p === 'packages/db/scripts/drift/canonical-fingerprint.reference.json',
  },
]

// ---------------------------------------------------------------------------
// Admin presentation-path predicate — the redesign's permitted surface
// (Req 16.1, 16.6). A path under apps/admin/src/app/api/** is API surface,
// NOT presentation, so it is explicitly excluded here.
// ---------------------------------------------------------------------------
function isPresentationPath(p) {
  if (p.startsWith('apps/admin/src/app/api/')) return false
  return (
    p.startsWith('apps/admin/src/components/') ||
    p.startsWith('apps/admin/src/app/') ||
    p.startsWith('apps/admin/src/lib/admin/') ||
    p.startsWith('apps/admin/app/') ||
    p.startsWith('apps/admin/components/')
  )
}

/** Return the protecting reason for a path, or null. */
function protectedReason(p) {
  for (const rule of PROTECTED) {
    if (rule.match(p)) return rule.reason
  }
  return null
}

// ---------------------------------------------------------------------------
// Formatting-only detection (Req 16 — intent, not letter)
//
// The gate exists to stop SEMANTIC changes to protected paths: contracts, the
// data model, RBAC logic. A repo-wide formatter or linter migration rewrites
// import order and whitespace across every file, protected ones included,
// while changing no behaviour. Failing those diffs is a false positive that
// cannot be resolved by splitting the PR because lint checks whole source trees.
//
// Use the repository's pinned Biome formatter plus organizeImports assist as
// the canonical representation. This removes any dependency on TypeScript's
// programmatic Compiler API while matching the formatter CI actually enforces.
// Invalid source fails closed to strict byte comparison. Comments remain
// significant because directives such as @ts-expect-error and biome-ignore can
// affect compilation or lint behavior even though they are not runtime syntax.
// ---------------------------------------------------------------------------

/**
 * Canonicalise TypeScript/JavaScript through pinned repository tooling.
 *
 * Formatting, quote style, semicolons, line wrapping, import order, named
 * specifier order, and equivalent merged imports normalize to the same output.
 * Returns null when Biome cannot parse/process the source; callers then use
 * strict byte comparison.
 */
function canonicaliseTs(path, content) {
  try {
    return execFileSync(
      process.execPath,
      [
        BIOME_BIN,
        'check',
        '--write',
        '--linter-enabled=false',
        '--assist-enabled=true',
        '--enforce-assist=true',
        '--colors=off',
        `--stdin-file-path=${path}`,
      ],
      {
        encoding: 'utf8',
        input: content,
        maxBuffer: 32 * 1024 * 1024,
      },
    ).trimEnd()
  } catch {
    return null
  }
}

/** Canonicalise JSON by key-sorted re-serialisation; null when unparseable. */
function canonicaliseJson(content) {
  const sortValue = (v) => {
    if (Array.isArray(v)) return v.map(sortValue)
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.keys(v)
          .sort()
          .map((k) => [k, sortValue(v[k])]),
      )
    }
    return v
  }
  try {
    return JSON.stringify(sortValue(JSON.parse(content)))
  } catch {
    return null
  }
}

/**
 * Canonical representation used to decide "formatting-only". Falls back to the
 * raw content (strict byte comparison) for file types with no safe normaliser,
 * so unknown formats keep the gate's original all-or-nothing behaviour.
 */
async function canonicalise(path, content) {
  if (/\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(path)) {
    const canonical = await canonicaliseTs(path, content)
    if (canonical !== null) return canonical
    return content
  }
  if (path.endsWith('.json')) {
    const canonical = canonicaliseJson(content)
    if (canonical !== null) return canonical
    return content
  }
  return content
}

/** Read a path's content at a git rev; null when it does not exist there. */
function showAtRev(rev, path) {
  try {
    return execFileSync('git', ['show', `${rev}:${path}`], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    })
  } catch {
    return null
  }
}

/**
 * True when the protected path's change is provably formatting-only: it exists
 * on both sides and both sides canonicalise identically (see canonicalise).
 */
async function isFormattingOnlyChange(base, path) {
  const before = showAtRev(base, path)
  if (before === null) return false

  // Prefer the working tree (covers local pre-commit runs); fall back to HEAD.
  let after = null
  try {
    after = readFileSync(path, 'utf8')
  } catch {
    after = showAtRev('HEAD', path)
  }
  if (after === null) return false

  const [a, b] = await Promise.all([canonicalise(path, before), canonicalise(path, after)])
  return a === b
}

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------
function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

function tryGit(args) {
  try {
    return git(args)
  } catch {
    return ''
  }
}

/** Resolve the base ref to diff against (see header for precedence). */
function resolveBase() {
  const argIdx = process.argv.indexOf('--base')
  if (argIdx !== -1 && process.argv[argIdx + 1]) {
    return process.argv[argIdx + 1]
  }
  if (process.env.BASE_SHA) return process.env.BASE_SHA

  // Local fallback: prefer the merge-base with the default integration branch
  // so a feature branch is compared against where it forked from; otherwise
  // fall back to the previous commit.
  for (const ref of ['origin/dev', 'origin/main', 'dev', 'main']) {
    const mb = tryGit(['merge-base', 'HEAD', ref])
    if (mb) return mb
  }
  return tryGit(['rev-parse', 'HEAD~1']) || 'HEAD'
}

/** Collect the set of changed, repo-relative, forward-slashed paths. */
function changedFiles(base) {
  const set = new Set()
  const add = (out) => {
    for (const line of out.split(/\r?\n/)) {
      const f = line.trim().replace(/\\/g, '/')
      if (f) set.add(f)
    }
  }

  // Committed range vs base (three-dot = since merge-base), mirroring the
  // cutover-guards migration-diff step.
  if (base && base !== 'HEAD') {
    add(tryGit(['diff', '--name-only', `${base}...HEAD`]))
  }
  // Fold in local staged + unstaged changes so the gate is useful pre-commit.
  add(tryGit(['diff', '--name-only', 'HEAD']))
  add(tryGit(['diff', '--name-only', '--cached']))

  return [...set]
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
const base = resolveBase()
const files = changedFiles(base)

const presentationChanges = files.filter(isPresentationPath)
const protectedTouches = files
  .map((f) => ({ file: f, reason: protectedReason(f) }))
  .filter((v) => v.reason !== null)

// Split protected touches into real (semantic) violations and formatting-only
// rewrites, which a linter/formatter migration produces and which change no
// contract, schema, or RBAC behaviour.
const protectedViolations = []
const formattingOnly = []
for (const touch of protectedTouches) {
  if (await isFormattingOnlyChange(base, touch.file)) {
    formattingOnly.push(touch)
  } else {
    protectedViolations.push(touch)
  }
}

// No presentation changes → this is not an admin-portal-redesign diff; the
// protected-path disciplines are enforced elsewhere (drift-gate / cutover).
if (presentationChanges.length === 0) {
  console.log(
    '✔ path-allowlist gate skipped — no admin presentation changes detected ' +
      `vs base (${base}). Protected-path discipline for non-redesign diffs is ` +
      'owned by the drift-gate and cutover-guards jobs.',
  )
  process.exit(0)
}

if (protectedViolations.length > 0) {
  console.error(
    '\n✖ path-allowlist gate FAILED — admin-portal-redesign diff makes a ' +
      'SEMANTIC change to PROTECTED path(s) (Req 16.1–16.3, 16.6–16.8).\n' +
      '  The redesign is presentation-layer ONLY: it must not change the data ' +
      'model, API contracts, RBAC logic, or the drift fingerprint reference.\n' +
      '  (Formatting-only rewrites of protected files are allowed and are not ' +
      'listed here — these files have added, removed, or edited code lines.)\n',
  )
  for (const v of protectedViolations) {
    console.error(`  • ${v.file}\n      ↳ ${v.reason}`)
  }
  console.error('\n  Admin presentation changes detected in the same diff:')
  for (const f of presentationChanges.slice(0, 10)) {
    console.error(`      · ${f}`)
  }
  if (presentationChanges.length > 10) {
    console.error(`      · …and ${presentationChanges.length - 10} more`)
  }
  console.error(
    '\nFix: revert the protected-path edits and keep the redesign confined to ' +
      'apps/admin/src/components/**, apps/admin/src/app/** (excluding api/**), ' +
      'apps/admin/src/lib/admin/**, and shared @rgss/ui tokens. If a schema / ' +
      'API / RBAC / drift change is genuinely required, land it in a SEPARATE, ' +
      'non-redesign PR.\n',
  )
  process.exit(1)
}

if (formattingOnly.length > 0) {
  console.log(
    `ℹ ${formattingOnly.length} protected path(s) were touched by a ` +
      'FORMATTING-ONLY change (identical after Biome formatting and import ' +
      'organization — reordered imports, rewrapping and/or re-indentation). Allowed: the gate ' +
      'guards against semantic ' +
      'changes to contracts, the data model, and RBAC logic, and a formatter or ' +
      'linter migration rewrites every file without changing behaviour.',
  )
  for (const v of formattingOnly.slice(0, 10)) {
    console.log(`      · ${v.file}`)
  }
  if (formattingOnly.length > 10) {
    console.log(`      · …and ${formattingOnly.length - 10} more`)
  }
}

console.log(
  '✔ path-allowlist gate passed — admin presentation changes detected and no ' +
    `protected path was semantically modified vs base (${base}). The redesign ` +
    'stays within its presentation-layer boundary (Req 16).',
)
process.exit(0)
