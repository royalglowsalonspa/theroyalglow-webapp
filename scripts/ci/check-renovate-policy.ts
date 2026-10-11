import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, matchesGlob, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { valid, validRange } from 'semver'
import { collectWorkspaces, type Manifest, type Workspace } from './check-dependency-overrides'

type Value = Record<string, unknown>
type PolicyManifest = Manifest & {
  workspaces?: string[]
}
type Bump = 'major' | 'minor' | 'patch'
type Dependency = { name: string; kind: string; file: string; manager: string }
type Route = { enabled: boolean; automerge: boolean; approval: boolean; group?: string }

const record = (value: unknown): value is Value =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

function patternMatches(value: string, pattern: string): boolean {
  if (pattern.startsWith('/') && pattern.endsWith('/')) {
    return new RegExp(pattern.slice(1, -1)).test(value)
  }
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*')
  return new RegExp(`^${escaped}$`).test(value)
}

// Renovate combines every matching rule in order. Positive alternatives are OR;
// negative patterns veto a match. This guard supports the repository's selectors
// only; adding a new selector requires extending its regression coverage first.
function matches(value: string, patterns: string[]): boolean {
  const positives = patterns.filter((pattern) => !pattern.startsWith('!'))
  return (
    (!positives.length || positives.some((pattern) => patternMatches(value, pattern))) &&
    !patterns.some((pattern) => pattern.startsWith('!') && patternMatches(value, pattern.slice(1)))
  )
}

const selectors = new Set([
  'matchManagers',
  'matchPackageNames',
  'matchDepNames',
  'matchDepTypes',
  'matchUpdateTypes',
  'matchFileNames',
])

function routeFor(config: Value, rules: Value[], dependency: Dependency, bump: Bump): Route {
  const state: Value = {
    enabled: config.enabled ?? true,
    automerge: config.automerge ?? false,
    dependencyDashboardApproval: config.dependencyDashboardApproval ?? false,
  }
  for (const rule of rules) {
    const fields: [string, string][] = [
      ['matchManagers', dependency.manager],
      ['matchPackageNames', dependency.name],
      ['matchDepNames', dependency.name],
      ['matchDepTypes', dependency.kind],
      ['matchUpdateTypes', bump],
      ['matchFileNames', dependency.file],
    ]
    if (
      !fields.every(([key, value]) => rule[key] === undefined || matches(value, strings(rule[key])))
    )
      continue
    Object.assign(state, rule)
  }
  const groupName = typeof state.groupName === 'string' ? state.groupName : undefined
  const groupSlug = typeof state.groupSlug === 'string' ? state.groupSlug : groupName
  return {
    enabled: state.enabled === true,
    automerge: state.automerge === true,
    approval: state.dependencyDashboardApproval === true,
    ...(groupName && groupSlug ? { group: `${groupName}:${groupSlug}` } : {}),
  }
}

const families = [
  { label: 'Vitest', patterns: ['vitest', '@vitest/*'] },
  { label: 'Better Auth', patterns: ['better-auth', '@better-auth/*'] },
  { label: 'Payload', patterns: ['payload', '@payloadcms/*', 'graphql'] },
  {
    label: 'Next/React',
    patterns: ['next', '@next/*', 'react', 'react-dom', '@types/react', '@types/react-dom'],
  },
  { label: 'Hono', patterns: ['hono', '@hono/*'] },
  { label: 'Tailwind', patterns: ['tailwindcss', '@tailwindcss/*'] },
]

type BunConfig = { file: string; config: unknown }
const minimumBunReleaseAge = 3 * 24 * 60 * 60

/** Inspect parsed native configuration; never infer TOML semantics from text matching. */
export function inspectBunReleaseAgePolicy(
  rootConfig: unknown,
  workspaceConfigs: BunConfig[] = [],
): string[] {
  const problems: string[] = []
  for (const { file, config } of [
    { file: 'bunfig.toml', config: rootConfig },
    ...workspaceConfigs,
  ]) {
    if (!record(config) || (config.install !== undefined && !record(config.install))) {
      problems.push(`${file}: Bun install settings must be a TOML table.`)
      continue
    }
    const install = record(config.install) ? config.install : {}
    if (
      (file === 'bunfig.toml' || install.minimumReleaseAge !== undefined) &&
      install.minimumReleaseAge !== minimumBunReleaseAge
    )
      problems.push(`${file}: install.minimumReleaseAge must be 259200 seconds (three days).`)
    const exclusions = install.minimumReleaseAgeExcludes
    if (file === 'bunfig.toml' && exclusions === undefined)
      problems.push(
        `${file}: explicitly set install.minimumReleaseAgeExcludes = [] to override inherited global exemptions.`,
      )
    if (exclusions !== undefined && (!Array.isArray(exclusions) || exclusions.length !== 0))
      problems.push(
        `${file}: persistent minimumReleaseAgeExcludes bypasses are forbidden; use the reviewed emergency procedure.`,
      )
  }
  return problems
}

export function checkBunReleaseAgePolicy(
  root: string,
  workspaces: Pick<Workspace, 'label'>[],
): string[] {
  const problems: string[] = []
  const configs: BunConfig[] = []
  const files = ['bunfig.toml', ...workspaces.map(({ label }) => `${label}/bunfig.toml`)]
  for (const file of files) {
    const absolutePath = resolve(root, file)
    if (!existsSync(absolutePath)) {
      if (file === 'bunfig.toml')
        problems.push('bunfig.toml: commit the native Bun three-day release-age policy.')
      continue
    }
    try {
      // The guard also runs in Node-based Vitest. Parse with the installed Bun
      // runtime through stdin, without evaluating repository content as code.
      const config: unknown = JSON.parse(
        execFileSync(
          'bun',
          [
            '--eval',
            'try { console.log(JSON.stringify(Bun.TOML.parse(await Bun.stdin.text()))) } catch { process.exit(1) }',
          ],
          { input: readFileSync(absolutePath, 'utf8'), encoding: 'utf8', timeout: 10000 },
        ),
      )
      configs.push({ file, config })
    } catch {
      problems.push(
        `${file}: could not parse native TOML with Bun; check the file and Bun installation.`,
      )
    }
  }
  const rootConfig = configs.find(({ file }) => file === 'bunfig.toml')
  if (rootConfig)
    problems.push(
      ...inspectBunReleaseAgePolicy(
        rootConfig.config,
        configs.filter(({ file }) => file !== 'bunfig.toml'),
      ),
    )
  return problems
}

/** Check repository policy; the official Renovate validator checks the full schema. */
export function inspectRenovatePolicy(
  config: unknown,
  root: PolicyManifest,
  workspaces: Workspace[],
): string[] {
  if (!record(config) || !Array.isArray(config.packageRules))
    return ['Renovate packageRules must be an array.']
  const problems: string[] = []
  const rules = config.packageRules.filter(record)
  if (rules.length !== config.packageRules.length)
    problems.push('Each package rule must be an object.')
  for (const rule of [config, ...rules]) {
    if (rule.allowedVersions !== undefined)
      problems.push('Do not hide newer dependency versions with allowedVersions ceilings.')
    for (const key of Object.keys(rule)) {
      if (key.startsWith('match') && !selectors.has(key))
        problems.push(`Unsupported policy selector ${key}; extend the guard before using it.`)
    }
    if (
      [rule.groupName, rule.groupSlug].some(
        (value) => typeof value === 'string' && value.includes('{{'),
      )
    )
      problems.push('Dependency groups must not split by templated package or workspace names.')
  }
  if (problems.length) return problems
  const managers = strings(config.enabledManagers)
  for (const manager of ['bun', 'github-actions', 'dockerfile']) {
    if (!managers.includes(manager)) problems.push(`Keep the ${manager} manager enabled.`)
  }
  if (strings(config.baseBranchPatterns).join(',') !== 'dev')
    problems.push('Dependency PRs must target dev only.')
  if (config.automerge !== false) problems.push('Automatic merging must stay explicitly disabled.')
  if (config.dependencyDashboard !== true)
    problems.push('Enable the dashboard so newer major versions remain visible.')
  if (
    typeof config.prConcurrentLimit !== 'number' ||
    !Number.isInteger(config.prConcurrentLimit) ||
    config.prConcurrentLimit < 1 ||
    config.prConcurrentLimit > 2
  )
    problems.push('Limit ordinary dependency PRs to at most two open PRs.')
  if (strings(config.includePaths).length || strings(config.ignoreDeps).length)
    problems.push('Do not hide workspace discovery or newer dependency versions with filters.')
  if (record(config.bun) && config.bun.managerFilePatterns !== undefined)
    problems.push('Keep Bun manifest/lockfile discovery defaults for the whole workspace.')
  if (!root.packageManager?.startsWith('bun@') || !valid(root.packageManager.slice(4)))
    problems.push('The root packageManager must declare an exact Bun version.')
  if (record(config.constraints) && config.constraints.bun !== undefined)
    problems.push(
      'Derive Bun from maintained packageManager declarations, not a separate constraints pin.',
    )
  const workspacePatterns = root.workspaces ?? []
  const manifests = [{ label: '', manifest: root }, ...workspaces]
  const declarations: Dependency[] = []
  const runtimes: Dependency[] = []
  for (const workspace of manifests) {
    const file = workspace.label ? `${workspace.label}/package.json` : 'package.json'
    if (workspace.manifest.packageManager !== root.packageManager)
      problems.push(
        `${file}: packageManager must match the root Bun version for workspace-only artifact generation.`,
      )
    runtimes.push({ name: 'bun', kind: 'packageManager', file, manager: 'bun' })
    if (strings(config.ignorePaths).some((pattern) => matchesGlob(file, pattern)))
      problems.push(`${file}: ignorePaths hides an active manifest.`)
    if (
      workspace.label &&
      (!workspacePatterns.some(
        (pattern) => !pattern.startsWith('!') && matchesGlob(workspace.label, pattern),
      ) ||
        workspacePatterns.some(
          (pattern) => pattern.startsWith('!') && matchesGlob(workspace.label, pattern.slice(1)),
        ))
    )
      problems.push(`${file}: add this manifest to root workspaces for one shared bun.lock.`)
    for (const kind of [
      'dependencies',
      'devDependencies',
      'peerDependencies',
      'optionalDependencies',
    ] as const) {
      for (const name of Object.keys(workspace.manifest[kind] ?? {}))
        declarations.push({ name, kind, file, manager: 'bun' })
    }
  }
  for (const [name, value] of Object.entries(root.overrides ?? {})) {
    if (!validRange(value)) continue
    if (name.lastIndexOf('@') > 0) {
      problems.push(
        `${name}: version-qualified overrides need a maintained root dependency reference for Bun lockfile updates.`,
      )
    } else {
      declarations.push({ name, kind: 'overrides', file: 'package.json', manager: 'bun' })
    }
  }
  try {
    const ordinaryGroups = new Set<string | undefined>()
    for (const dependency of declarations) {
      for (const bump of ['minor', 'patch', 'major'] as const) {
        const route = routeFor(config, rules, dependency, bump)
        if (!route.enabled)
          problems.push(
            `${dependency.name}: ${bump} updates must remain discoverable, not disabled.`,
          )
        if (route.automerge)
          problems.push(`${dependency.name}: ${bump} updates must not automerge.`)
        if (bump === 'major' && !route.approval)
          problems.push(
            `${dependency.name}: major upgrades require dashboard approval before PR creation.`,
          )
        if (bump !== 'major') {
          if (route.approval)
            problems.push(
              `${dependency.name}: routine updates must not wait for dashboard approval.`,
            )
          ordinaryGroups.add(route.group)
        }
      }
    }
    if (ordinaryGroups.size !== 1 || ordinaryGroups.has(undefined))
      problems.push('All ordinary Bun package minor/patch updates must share one platform group.')
    for (const family of families) {
      const members = declarations.filter(({ name }) => matches(name, family.patterns))
      if (!members.length) continue
      const groups = new Set(
        members.map((dependency) => routeFor(config, rules, dependency, 'major').group),
      )
      if (groups.size !== 1 || groups.has(undefined))
        problems.push(
          `${family.label} majors must share one reviewed group across workspaces and dependency types.`,
        )
    }
    const activeDocker = {
      name: 'node',
      kind: 'final',
      file: 'apps/invoicing/Dockerfile',
      manager: 'dockerfile',
    }
    const action = {
      name: 'actions/checkout',
      kind: 'uses',
      file: '.github/workflows/ci.yml',
      manager: 'github-actions',
    }
    const runtimeMajors = new Set(
      runtimes.map((dependency) => routeFor(config, rules, dependency, 'major').group),
    )
    if (runtimeMajors.size !== 1 || runtimeMajors.has(undefined))
      problems.push('Bun major upgrades must group every workspace packageManager declaration.')
    const toolingGroups = new Set<string | undefined>()
    for (const dependency of [activeDocker, action, ...runtimes]) {
      for (const bump of ['minor', 'patch', 'major'] as const) {
        const route = routeFor(config, rules, dependency, bump)
        if (bump !== 'major') toolingGroups.add(route.group)
        if (!route.enabled || route.automerge || (bump === 'major' && !route.approval))
          problems.push(
            `${dependency.file}: keep updates enabled, reviewed and majors dashboard-approved.`,
          )
      }
    }
    if (toolingGroups.size !== 1 || toolingGroups.has(undefined))
      problems.push(
        'Actions, active container and Bun runtime minor/patch updates must share one tooling group.',
      )
    for (const file of ['apps/cms/Dockerfile', 'infra/aws/_ec2-path/Dockerfile.monorepo']) {
      if (routeFor(config, rules, { ...activeDocker, file }, 'patch').enabled)
        problems.push(`${file}: exclude retired container paths from update PRs.`)
    }
  } catch (error) {
    problems.push(
      `Invalid matching pattern: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  for (const [name, value] of Object.entries(root.overrides ?? {})) {
    if (value.startsWith('$')) {
      const reference = value.slice(1)
      if (!root.dependencies?.[reference] && !root.devDependencies?.[reference])
        problems.push(`${name}: reference ${value} needs a maintained root direct dependency.`)
    }
  }
  if (!record(config.vulnerabilityAlerts)) {
    problems.push(
      'Configure immediate reviewed Renovate security proposals; retain native Bun artifact age enforcement.',
    )
  } else {
    const security = config.vulnerabilityAlerts
    if (
      security.enabled !== true ||
      security.automerge !== false ||
      security.dependencyDashboardApproval !== false ||
      strings(security.schedule).length ||
      security.minimumReleaseAge !== '0 days'
    )
      problems.push(
        'Renovate security proposals must bypass scheduling/proposal-age/approval while retaining review; Bun artifact age remains enforced.',
      )
  }
  return [...new Set(problems)]
}

export function checkRenovatePolicy(root: string): string[] {
  const manifest: PolicyManifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
  const config: unknown = JSON.parse(readFileSync(resolve(root, '.github/renovate.json'), 'utf8'))
  const workspaces = collectWorkspaces(root)
  const problems = [
    ...inspectRenovatePolicy(config, manifest, workspaces),
    ...checkBunReleaseAgePolicy(root, workspaces),
  ]
  if (
    existsSync(resolve(root, '.github/dependabot.yml')) ||
    existsSync(resolve(root, '.github/dependabot.yaml'))
  )
    problems.push('Remove competing Dependabot version-update configuration during cutover.')
  return problems
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const problems = checkRenovatePolicy(resolve(dirname(fileURLToPath(import.meta.url)), '../..'))
  if (problems.length) {
    console.error(`Renovate policy check failed:\n${problems.join('\n')}`)
    process.exitCode = 1
  } else {
    console.log(
      'Renovate maintains one shared Bun workspace, two routine batches, reviewed majors and a native three-day Bun age gate.',
    )
  }
}
