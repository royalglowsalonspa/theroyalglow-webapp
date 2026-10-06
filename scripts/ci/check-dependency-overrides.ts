import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compare, intersects, minVersion, satisfies, valid, validRange } from 'semver'
import { resolveInstalledPackage } from './check-auth-dependencies'

/**
 * Security overrides must not make workspace declarations describe a newer
 * dependency than the consumer actually resolves. Check both the permitted
 * ranges and the installation: a caret can admit a new release while an old
 * lockfile still resolves below the workspace's requirement.
 */
export type Manifest = {
  name?: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  overrides?: Record<string, string>
}

export type Workspace = { label: string; manifest: Manifest }
export type OverrideResolver = (workspace: Workspace, name: string) => string

type Override = { key: string; name: string; selector: string | undefined; range: string }

const readManifest = (path: string): Manifest => JSON.parse(readFileSync(path, 'utf8')) as Manifest

/** Compare SemVer, including numeric prerelease identifiers and partial versions. */
export function compareVersions(a: string, b: string): number {
  const left = minVersion(a)
  const right = minVersion(b)
  if (!left || !right) throw new TypeError(`Cannot compare versions ${a} and ${b}`)
  return compare(left, right)
}

/** Return a SemVer range's floor; non-version dependency specifiers have none. */
export function minimumVersionOf(range: string): string | null {
  if (!validRange(range)) return null
  return minVersion(range)?.version ?? null
}

/**
 * Support package names and Bun's package@range selectors. Fail visibly for
 * unsupported key forms so adding a scoped rule cannot silently bypass the gate.
 */
function parseOverrides(root: Manifest, problems: string[]): Override[] {
  const rules: Override[] = []
  for (const [key, range] of Object.entries(root.overrides ?? {})) {
    if (typeof range !== 'string') {
      problems.push(
        `Unsupported nested dependency override ${key}; extend the override check first.`,
      )
      continue
    }
    const match = /^(@[^/@\s]+\/[^@\s>]+|[^@/\s>]+)(?:@(.+))?$/.exec(key)
    const name = match?.[1]
    const selector = match?.[2]
    if (!name || (selector !== undefined && !validRange(selector))) {
      problems.push(`Unsupported dependency override key ${key}; extend the override check first.`)
      continue
    }
    // Git, URL, npm aliases and catalog values do not provide a SemVer floor.
    if (!validRange(range)) continue
    rules.push({ key, name, selector, range })
  }
  return rules
}

/**
 * Reject downgrades, preserving deliberate upward security overrides. Scoped
 * rules match the dependent's declared range, as Bun does, not its installed
 * version. A range's lower bound alone cannot establish a downgrade.
 */
export function inspectOverrides(
  root: Manifest,
  workspaces: Workspace[],
  resolveVersion?: OverrideResolver,
): string[] {
  const problems: string[] = []
  const rules = parseOverrides(root, problems)
  for (const workspace of workspaces) {
    const declarations = {
      ...workspace.manifest.peerDependencies,
      ...workspace.manifest.devDependencies,
      ...workspace.manifest.dependencies,
    }
    for (const [name, declared] of Object.entries(declarations)) {
      const declaredMinimum = minimumVersionOf(declared)
      if (!declaredMinimum) continue
      const namedRules = rules.filter((rule) => rule.name === name)
      if (!namedRules.length) continue
      const applicable = namedRules.filter(
        (rule) => rule.selector === undefined || intersects(declared, rule.selector),
      )
      for (const rule of applicable) {
        if (!intersects(rule.range, `>=${declaredMinimum}`)) {
          problems.push(
            `${name}: root override ${rule.key} requires ${rule.range}, but ` +
              `${workspace.label} declares ${declared}. The override cannot install ` +
              `a version at or above ${declaredMinimum}.`,
          )
        }
      }
      if (!resolveVersion) continue
      let installed: string
      try {
        installed = resolveVersion(workspace, name)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        problems.push(`${workspace.label} -> ${name}: cannot resolve installed package: ${message}`)
        continue
      }
      if (!valid(installed)) {
        problems.push(`${workspace.label} -> ${name}: invalid installed version ${installed}`)
        continue
      }
      // Check even when no selector matches: a v7 rule must not cause a consumer
      // that declares v8 to resolve v7 through a stale or incompatible lockfile.
      if (compareVersions(installed, declaredMinimum) < 0) {
        problems.push(
          `${workspace.label} -> ${name}: declares ${declared}, resolves ${installed} ` +
            `(below ${declaredMinimum}). Refresh the override and lockfile together.`,
        )
      }
      for (const rule of applicable) {
        if (!satisfies(installed, rule.range)) {
          problems.push(
            `${workspace.label} -> ${name}: resolves ${installed}, outside root override ` +
              `${rule.key}: ${rule.range}.`,
          )
        }
      }
    }
  }
  return problems
}

/** Collect every apps/* and packages/* workspace. */
export function collectWorkspaces(root: string): Workspace[] {
  const workspaces: Workspace[] = []
  for (const group of ['apps', 'packages']) {
    const directory = resolve(root, group)
    if (!existsSync(directory)) continue
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const path = resolve(directory, entry.name, 'package.json')
      if (!existsSync(path)) continue
      workspaces.push({ label: `${group}/${entry.name}`, manifest: readManifest(path) })
    }
  }
  return workspaces
}

export function checkDependencyOverrides(root: string): string[] {
  const manifest = readManifest(resolve(root, 'package.json'))
  const rootWorkspace = { label: 'the root manifest', manifest }
  const workspaces = [rootWorkspace, ...collectWorkspaces(root)]
  return inspectOverrides(manifest, workspaces, (workspace, name) => {
    const directory = workspace === rootWorkspace ? root : resolve(root, workspace.label)
    return resolveInstalledPackage(resolve(directory, 'package.json'), name).manifest.version
  })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
  const problems = checkDependencyOverrides(root)
  if (problems.length) {
    console.error(`Dependency override check failed:\n${problems.join('\n')}`)
    process.exitCode = 1
  } else {
    console.log('Dependency overrides and installed versions meet workspace version floors.')
  }
}
