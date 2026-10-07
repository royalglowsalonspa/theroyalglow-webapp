import { readFileSync } from 'node:fs'
import { dirname, matchesGlob, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectWorkspaces, type Manifest, type Workspace } from './check-dependency-overrides'

type RecordValue = Record<string, unknown>
type PolicyManifest = Manifest & { workspaces?: string[] }
type Bump = 'major' | 'minor' | 'patch'

const record = (value: unknown): value is RecordValue =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
const matches = (name: string, patterns: string[]) =>
  patterns.some((pattern) => {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*')
    return new RegExp(`^${escaped}$`).test(name)
  })

// These families share a runtime or internal API. Unrelated major updates remain
// standalone; grouping them is not a substitute for migration review.
const families: { label: string; patterns: string[]; bumps: Bump[] }[] = [
  { label: 'Vitest', patterns: ['vitest', '@vitest/*'], bumps: ['major', 'minor', 'patch'] },
  { label: 'Better Auth', patterns: ['better-auth', '@better-auth/*'], bumps: ['minor', 'patch'] },
  {
    label: 'Payload',
    patterns: ['payload', '@payloadcms/*', 'graphql'],
    bumps: ['minor', 'patch'],
  },
  {
    label: 'Next/React',
    patterns: ['next', '@next/*', 'react', 'react-dom', '@types/react', '@types/react-dom'],
    bumps: ['minor', 'patch'],
  },
  { label: 'Hono', patterns: ['hono', '@hono/*'], bumps: ['minor', 'patch'] },
  { label: 'Tailwind', patterns: ['tailwindcss', '@tailwindcss/*'], bumps: ['minor', 'patch'] },
]

function groupFor(entry: RecordValue, name: string, kind: string, bump: Bump): string | undefined {
  if (!record(entry.groups)) return undefined
  for (const [label, group] of Object.entries(entry.groups)) {
    if (!record(group) || (group['applies-to'] && group['applies-to'] !== 'version-updates'))
      continue
    if (group['dependency-type'] && group['dependency-type'] !== kind) continue
    if (group.patterns && !matches(name, strings(group.patterns))) continue
    if (matches(name, strings(group['exclude-patterns']))) continue
    if (group['update-types'] && !strings(group['update-types']).includes(bump)) continue
    // Per-dependency grouping would split packages in a coupled family.
    return group['group-by'] === 'dependency-name' ? `${label}:${name}` : label
  }
  return undefined
}

/** Validate discovery and update routing, without reproducing Dependabot's resolver. */
export function inspectDependabotPolicy(
  config: unknown,
  root: PolicyManifest,
  workspaces: Workspace[],
): string[] {
  const problems: string[] = []
  if (!record(config) || !Array.isArray(config.updates))
    return ['Dependabot updates must be an array.']
  const entries = config.updates
    .filter(record)
    .filter((entry) => entry['package-ecosystem'] === 'bun')
  if (entries.length !== 1)
    return ['Use one Bun update entry for the shared workspace and bun.lock.']
  const entry = entries[0]
  if (!entry) return problems
  if (entry.directory !== '/' || entry.directories !== undefined) {
    problems.push('Bun must scan directory "/" only; child scans duplicate workspace updates.')
  }
  if (entry['target-branch'] !== 'dev') problems.push('Bun dependency updates must target dev.')
  if (entry.allow !== undefined || strings(entry['exclude-paths']).length > 0) {
    problems.push(
      'Bun discovery must cover all direct dependencies; remove allow/exclude-paths filters.',
    )
  }

  const workspacePatterns = root.workspaces ?? []
  for (const workspace of workspaces) {
    if (
      !workspacePatterns.some(
        (pattern) => !pattern.startsWith('!') && matchesGlob(workspace.label, pattern),
      ) ||
      workspacePatterns.some(
        (pattern) => pattern.startsWith('!') && matchesGlob(workspace.label, pattern.slice(1)),
      )
    ) {
      problems.push(
        `${workspace.label}: add this manifest to root workspaces so Dependabot discovers it.`,
      )
    }
  }

  const declarations = [root, ...workspaces.map((workspace) => workspace.manifest)].flatMap(
    (manifest) => [
      ...Object.keys(manifest.dependencies ?? {}).map((name) => ({ name, kind: 'production' })),
      ...Object.keys(manifest.devDependencies ?? {}).map((name) => ({ name, kind: 'development' })),
    ],
  )
  for (const family of families) {
    const members = declarations.filter(({ name }) => matches(name, family.patterns))
    if (!members.length) continue
    for (const bump of family.bumps) {
      const groups = new Set(members.map(({ name, kind }) => groupFor(entry, name, kind, bump)))
      if (groups.has(undefined) || groups.size !== 1) {
        problems.push(
          `${family.label} ${bump} updates must share one group across all workspaces and dependency types.`,
        )
      }
    }
  }

  if (
    declarations.some(({ name }) => name === 'payload') &&
    declarations.some(({ name }) => name === 'graphql')
  ) {
    const ignores = Array.isArray(entry.ignore) ? entry.ignore.filter(record) : []
    const manualMajor = ignores.some(
      (ignore) =>
        ignore['dependency-name'] === 'graphql' &&
        strings(ignore['update-types']).length === 1 &&
        strings(ignore['update-types'])[0] === 'version-update:semver-major' &&
        strings(ignore.versions).length === 0,
    )
    if (!manualMajor)
      problems.push(
        'GraphQL majors require an explicit manual Payload migration; minor/patch updates must stay enabled.',
      )
  }
  for (const [name, value] of Object.entries(root.overrides ?? {})) {
    if (!value.startsWith('$')) continue
    const reference = value.slice(1)
    if (!root.dependencies?.[reference] && !root.devDependencies?.[reference]) {
      problems.push(
        `${name}: override ${value} needs a root direct dependency for Dependabot to maintain.`,
      )
      continue
    }
    const ignores = Array.isArray(entry.ignore) ? entry.ignore.filter(record) : []
    for (const ignore of ignores) {
      if (!matches(reference, strings([ignore['dependency-name']]))) continue
      const types = strings(ignore['update-types'])
      if (
        !types.length ||
        types.some((type) => type !== 'version-update:semver-major') ||
        strings(ignore.versions).length
      ) {
        problems.push(
          `${reference}: Dependabot ignore hides updates to a referenced security override.`,
        )
      }
    }
  }
  return problems
}

/** Bun is only needed for the CLI's YAML parsing; pure checks also run under Node/Vitest. */
function parseYaml(source: string): unknown {
  const runtime: unknown = Reflect.get(globalThis, 'Bun')
  if (!record(runtime) || !record(runtime.YAML) || typeof runtime.YAML.parse !== 'function') {
    throw new Error('Run the Dependabot policy check with Bun to parse its YAML configuration.')
  }
  return runtime.YAML.parse(source)
}

export function checkDependabotPolicy(root: string): string[] {
  const manifest: PolicyManifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
  const config: unknown = parseYaml(readFileSync(resolve(root, '.github/dependabot.yml'), 'utf8'))
  return inspectDependabotPolicy(config, manifest, collectWorkspaces(root))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const problems = checkDependabotPolicy(resolve(dirname(fileURLToPath(import.meta.url)), '../..'))
  if (problems.length) {
    console.error(`Dependabot policy check failed:\n${problems.join('\n')}`)
    process.exitCode = 1
  } else {
    console.log(
      'Dependabot discovers one Bun workspace with coupled updates and maintained override references.',
    )
  }
}
