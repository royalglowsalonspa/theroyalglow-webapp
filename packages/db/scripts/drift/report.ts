/************************************************************
 * Schema Drift Remediation — conformance & diff report renderer.
 *
 * Renders human-readable (markdown) and machine-readable (json) reports of:
 *   - structural diffs (`DiffEntry[]`) grouped by status / kind / table,
 *   - data pre-check violations (`PreCheckResult[]`) with bounded samples,
 *   - the ratified `test`/`pprd` data-loss tradeoff note (Req 9.3),
 *   - post-rollout per-branch divergence from canonical (Req 8.6).
 *
 * PURE: no I/O. Rendering is DETERMINISTIC for fixed inputs — stable object /
 * entry ordering and recursively sorted JSON keys, with no timestamps embedded
 * unless one is explicitly injected via `input.generatedAt`.
 *
 * Mirrors design "Component 7: runner + report" of
 * `.kiro/specs/schema-drift-remediation/design.md`.
 *
 * _Requirements: 5.5, 8.6, 9.3, 11.2_
 ************************************************************/

import type { BranchId, DiffEntry, DiffKind, DiffStatus, PreCheckResult, SchemaDiff } from './types'

// ─────────────────────────────────────────────────────────
// Input view types — the report layer accepts these small, pure shapes.
// They are assembled by the `runner` (task 10) from `diff` / `precheck`
// outputs plus the `neon-admin` rollout results. Defined here to keep the
// renderer self-contained and dependency-free.
// ─────────────────────────────────────────────────────────

/** Audit/verify result for a single branch measured against canonical. */
export type BranchConformance = {
  branch: BranchId
  /** Structural diff of the branch against the Canonical_Fingerprint. */
  diff: SchemaDiff
  /** Evaluated data pre-checks for the additive steps on this branch. */
  preChecks: PreCheckResult[]
  /** True when an archived branch could not be reactivated for audit (Req 11.2). */
  reactivationFailed?: boolean
}

/** Full conformance report input (audit + fork-verify phases). */
export type ConformanceReport = {
  /** Canonical_Fingerprint hash every branch must converge to. */
  canonicalHash: string
  branches: BranchConformance[]
  /** Optional injected timestamp; omitted output stays timestamp-free. */
  generatedAt?: string
}

/** Convergence strategy applied to a branch during rollout. */
export type RolloutStrategy = 'forward_migrate' | 'reset_from_parent'

/** Post-rollout outcome for a single branch. */
export type BranchRolloutOutcome = {
  branch: BranchId
  strategy: RolloutStrategy
  /** Branch fingerprint hash after rollout. */
  fingerprintHash: string
  /** True iff `fingerprintHash === canonicalHash`. */
  matchesCanonical: boolean
}

/** Post-rollout report input (divergence of all branches from canonical). */
export type RolloutReport = {
  canonicalHash: string
  branches: BranchRolloutOutcome[]
  generatedAt?: string
}

// ─────────────────────────────────────────────────────────
// Fixed ratified note — verbatim, never templated (Req 9.3).
// ─────────────────────────────────────────────────────────

/**
 * The ratified data-loss tradeoff statement. `test` and `pprd` are
 * non-authoritative and are made schema-identical via `reset_from_parent`,
 * which discards their existing data. This is an accepted, deliberate
 * decision — not an accident.
 */
export const RATIFIED_DATA_LOSS_NOTE =
  'RATIFIED TRADEOFF: `test` and `pprd` data is discarded by `reset_from_parent` ' +
  'as a deliberately accepted tradeoff for guaranteed schema identity. ' +
  '`prod` and `dev` are never reset and their data is preserved.'

// ─────────────────────────────────────────────────────────
// Deterministic ordering tables.
// ─────────────────────────────────────────────────────────

const STATUS_ORDER: readonly DiffStatus[] = ['missing_on_branch', 'extra_on_branch', 'divergent']

const STATUS_HEADING: Readonly<Record<DiffStatus, string>> = {
  missing_on_branch: 'Missing on branch',
  extra_on_branch: 'Extra on branch',
  divergent: 'Divergent',
}

const KIND_ORDER: readonly DiffKind[] = [
  'enum',
  'column',
  'primaryKey',
  'unique',
  'foreignKey',
  'index',
]

function indexOfStatus(status: DiffStatus): number {
  const i = STATUS_ORDER.indexOf(status)
  return i === -1 ? STATUS_ORDER.length : i
}

function indexOfKind(kind: DiffKind): number {
  const i = KIND_ORDER.indexOf(kind)
  return i === -1 ? KIND_ORDER.length : i
}

function byString(a: string, b: string): number {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

/**
 * Total, stable ordering of diff entries: status, then kind, then table
 * (null tables — e.g. enums — sort last within a kind), then object name.
 */
function compareEntries(a: DiffEntry, b: DiffEntry): number {
  const byStatus = indexOfStatus(a.status) - indexOfStatus(b.status)
  if (byStatus !== 0) return byStatus
  const byKind = indexOfKind(a.kind) - indexOfKind(b.kind)
  if (byKind !== 0) return byKind
  const byTable = byString(a.table ?? '~', b.table ?? '~')
  if (byTable !== 0) return byTable
  return byString(a.object, b.object)
}

/** Stable ordering of pre-check results: kind, then description. */
function comparePreChecks(a: PreCheckResult, b: PreCheckResult): number {
  const byKind = byString(a.check.kind, b.check.kind)
  if (byKind !== 0) return byKind
  return byString(a.check.description, b.check.description)
}

function sortedBranches<T extends { branch: BranchId }>(branches: readonly T[]): T[] {
  return [...branches].sort((a, b) => byString(a.branch, b.branch))
}

// ─────────────────────────────────────────────────────────
// Deterministic JSON — recursively sorted object keys, stable array order.
// ─────────────────────────────────────────────────────────

/**
 * Deterministic `JSON.stringify` with recursively sorted object keys and
 * 2-space indentation. Arrays preserve their (already deterministic) order.
 */
function stableJson(value: unknown, indent = 0): string {
  const pad = '  '.repeat(indent)
  const childPad = '  '.repeat(indent + 1)

  if (value === null || value === undefined) return 'null'

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    const items = value.map((v) => `${childPad}${stableJson(v, indent + 1)}`)
    return `[\n${items.join(',\n')}\n${pad}]`
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const keys = Object.keys(obj).sort(byString)
    if (keys.length === 0) return '{}'
    const entries = keys.map(
      (k) => `${childPad}${JSON.stringify(k)}: ${stableJson(obj[k], indent + 1)}`,
    )
    return `{\n${entries.join(',\n')}\n${pad}}`
  }

  return JSON.stringify(value)
}

// ─────────────────────────────────────────────────────────
// Markdown helpers.
// ─────────────────────────────────────────────────────────

/** Render one diff entry as a markdown list item. */
function renderEntryLine(entry: DiffEntry): string {
  const location = entry.table === null ? entry.object : `${entry.table}.${entry.object}`
  return `- **${entry.kind}** \`${location}\``
}

/** Render a branch's diff grouped by status then kind, deterministically. */
function renderDiffSection(diff: SchemaDiff): string[] {
  if (diff.isIdentical || diff.objects.length === 0) {
    return ['Identical to canonical — no structural discrepancies.']
  }

  const lines: string[] = [`${diff.objects.length} structural discrepancies:`, '']
  const ordered = [...diff.objects].sort(compareEntries)

  for (const status of STATUS_ORDER) {
    const inStatus = ordered.filter((e) => e.status === status)
    if (inStatus.length === 0) continue
    lines.push(`#### ${STATUS_HEADING[status]} (${inStatus.length})`)
    for (const entry of inStatus) lines.push(renderEntryLine(entry))
    lines.push('')
  }

  return lines
}

/** Render blocked (failed) pre-checks with counts and bounded samples. */
function renderBlockedPreChecks(preChecks: readonly PreCheckResult[]): string[] {
  const blocked = preChecks.filter((p) => !p.passed).sort(comparePreChecks)
  if (blocked.length === 0) return ['All data pre-checks passed.']

  const lines: string[] = [`${blocked.length} blocked data pre-checks:`, '']
  for (const result of blocked) {
    lines.push(`- **${result.check.kind}** — ${result.check.description}`)
    lines.push(`  - Violations: ${result.violationCount}`)
    if (result.sample.length > 0) {
      lines.push(`  - Sample (${result.sample.length} of ${result.violationCount}):`)
      lines.push('')
      lines.push('    ```json')
      lines.push(`    ${stableJson(result.sample)}`)
      lines.push('    ```')
    }
    lines.push('')
  }
  return lines
}

function renderBranchConformance(branch: BranchConformance): string[] {
  const lines: string[] = [`## Branch: ${branch.branch}`, '']
  lines.push(`- Branch fingerprint: \`${branch.diff.toBranchHash}\``)
  lines.push(`- Identical to canonical: ${branch.diff.isIdentical ? 'yes' : 'no'}`)
  if (branch.reactivationFailed) {
    lines.push(
      '- Reactivation failed: this archived branch could not be reactivated for ' +
        'audit; results are unavailable and the pipeline continued with the other branches.',
    )
  }
  lines.push('')

  lines.push('### Schema discrepancies', '')
  lines.push(...renderDiffSection(branch.diff))

  lines.push('### Data pre-checks', '')
  lines.push(...renderBlockedPreChecks(branch.preChecks))

  return lines
}

// ─────────────────────────────────────────────────────────
// Public renderers — conformance (audit / fork-verify).
// ─────────────────────────────────────────────────────────

/**
 * Render a deterministic markdown conformance report: per-branch structural
 * diffs and blocked data pre-checks, plus the ratified data-loss note.
 * Branches are emitted in stable (sorted) order; no timestamp appears unless
 * `report.generatedAt` is provided.
 */
function conformanceMarkdown(report: ConformanceReport): string {
  const lines: string[] = ['# Schema Drift Conformance Report', '']
  lines.push(`- Canonical fingerprint: \`${report.canonicalHash}\``)
  if (report.generatedAt !== undefined) lines.push(`- Generated: ${report.generatedAt}`)
  lines.push('')
  lines.push(`> ${RATIFIED_DATA_LOSS_NOTE}`, '')

  for (const branch of sortedBranches(report.branches)) {
    lines.push(...renderBranchConformance(branch))
  }

  return `${lines.join('\n').trimEnd()}\n`
}

/**
 * Render a deterministic JSON conformance report. Object keys are recursively
 * sorted; branches are stably ordered. `generatedAt` is included only when
 * injected. The ratified data-loss note is always present under `note`.
 */
function conformanceJson(report: ConformanceReport): string {
  const payload: Record<string, unknown> = {
    canonicalHash: report.canonicalHash,
    note: RATIFIED_DATA_LOSS_NOTE,
    branches: sortedBranches(report.branches).map((branch) => ({
      branch: branch.branch,
      identical: branch.diff.isIdentical,
      branchHash: branch.diff.toBranchHash,
      reactivationFailed: branch.reactivationFailed === true,
      discrepancies: [...branch.diff.objects].sort(compareEntries).map((entry) => ({
        kind: entry.kind,
        table: entry.table,
        object: entry.object,
        status: entry.status,
      })),
      blockedPreChecks: branch.preChecks
        .filter((p) => !p.passed)
        .sort(comparePreChecks)
        .map((result) => ({
          kind: result.check.kind,
          description: result.check.description,
          violationCount: result.violationCount,
          sample: result.sample,
        })),
    })),
  }
  if (report.generatedAt !== undefined) payload.generatedAt = report.generatedAt
  return `${stableJson(payload)}\n`
}

// ─────────────────────────────────────────────────────────
// Public renderers — rollout (post-rollout divergence, Req 8.6).
// ─────────────────────────────────────────────────────────

function renderRolloutOutcome(outcome: BranchRolloutOutcome): string {
  const verdict = outcome.matchesCanonical ? 'matches canonical' : 'DIVERGED'
  return `- **${outcome.branch}** (${outcome.strategy}): ${verdict} — \`${outcome.fingerprintHash}\``
}

/**
 * Render a deterministic markdown rollout report: each branch's convergence
 * strategy and whether its post-rollout fingerprint matches canonical, with an
 * explicit divergence list when any branch fails to converge (Req 8.6).
 */
function rolloutMarkdown(report: RolloutReport): string {
  const ordered = sortedBranches(report.branches)
  const diverged = ordered.filter((b) => !b.matchesCanonical)

  const lines: string[] = ['# Schema Drift Rollout Report', '']
  lines.push(`- Canonical fingerprint: \`${report.canonicalHash}\``)
  if (report.generatedAt !== undefined) lines.push(`- Generated: ${report.generatedAt}`)
  lines.push(`- All branches converged: ${diverged.length === 0 ? 'yes' : 'no'}`)
  lines.push('')
  lines.push(`> ${RATIFIED_DATA_LOSS_NOTE}`, '')

  lines.push('## Per-branch convergence', '')
  for (const outcome of ordered) lines.push(renderRolloutOutcome(outcome))
  lines.push('')

  if (diverged.length > 0) {
    lines.push('## Divergence', '')
    lines.push(
      `The following branches do not match the canonical fingerprint: ${diverged
        .map((b) => b.branch)
        .join(', ')}.`,
    )
    lines.push('')
  }

  return `${lines.join('\n').trimEnd()}\n`
}

/**
 * Render a deterministic JSON rollout report. Branches are stably ordered and
 * keys recursively sorted; a `converged` flag and explicit `divergedBranches`
 * list make post-rollout divergence machine-checkable (Req 8.6).
 */
function rolloutJson(report: RolloutReport): string {
  const ordered = sortedBranches(report.branches)
  const diverged = ordered.filter((b) => !b.matchesCanonical)

  const payload: Record<string, unknown> = {
    canonicalHash: report.canonicalHash,
    note: RATIFIED_DATA_LOSS_NOTE,
    converged: diverged.length === 0,
    divergedBranches: diverged.map((b) => b.branch),
    branches: ordered.map((outcome) => ({
      branch: outcome.branch,
      strategy: outcome.strategy,
      fingerprintHash: outcome.fingerprintHash,
      matchesCanonical: outcome.matchesCanonical,
    })),
  }
  if (report.generatedAt !== undefined) payload.generatedAt = report.generatedAt
  return `${stableJson(payload)}\n`
}

// ─────────────────────────────────────────────────────────
// Reporter public surface.
// ─────────────────────────────────────────────────────────

export const Reporter = {
  conformanceMarkdown,
  conformanceJson,
  rolloutMarkdown,
  rolloutJson,
}
