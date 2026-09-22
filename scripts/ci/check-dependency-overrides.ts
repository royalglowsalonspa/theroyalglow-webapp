import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Root `overrides` exist to force the whole dependency tree onto a minimum safe
 * version so `bun audit` passes. They silently do the opposite when a workspace
 * later declares a NEWER version than the override pins: Bun honours the
 * override, so the declared version never installs and `package.json` stops
 * describing what is actually on disk.
 *
 * Dependabot raises workspace ranges but never touches root `overrides`, so this
 * inversion arrives with routine dependency bumps and no gate notices.
 */

export type Manifest = {
  name?: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  overrides?: Record<string, string>
}

export type Workspace = { label: string; manifest: Manifest }

const readManifest = (path: string): Manifest => JSON.parse(readFileSync(path, 'utf8')) as Manifest

/** Numeric triple comparison. A prerelease sorts below its own release. */
export function compareVersions(a: string, b: string): number {
  const split = (version: string) => {
    const [core = '', prerelease = ''] = version.split('-', 2)
    return { parts: core.split('.').map(Number), prerelease }
  }
  const left = split(a)
  const right = split(b)
  for (let index = 0; index < 3; index += 1) {
    const difference = (left.parts[index] ?? 0) - (right.parts[index] ?? 0)
    if (difference !== 0) return difference < 0 ? -1 : 1
  }
  if (left.prerelease === right.prerelease) return 0
  if (left.prerelease === '') return 1
  if (right.prerelease === '') return -1
  return left.prerelease < right.prerelease ? -1 : 1
}

/**
 * Lowest version a range admits, or null when the range cannot be reasoned
 * about safely (`*`, `workspace:*`, unions, tags, URLs). Skipping is deliberate:
 * this gate only reports the unambiguous "override below declared" inversion.
 */
export function minimumVersionOf(range: string): string | null {
  const normalised = range.trim()
  if (normalised.includes('||') || normalised.includes(' ')) return null
  const match = /^(?:\^|~|>=|=)?(\d+\.\d+\.\d+(?:-[\w.-]+)?)$/.exec(normalised)
  return match?.[1] ?? null
}

/** Report overrides that resolve BELOW a version some workspace declares. */
export function inspectOverrides(root: Manifest, workspaces: Workspace[]): string[] {
  const problems: string[] = []
  const overrides = root.overrides ?? {}
  for (const [name, pinned] of Object.entries(overrides)) {
    const pinnedMinimum = minimumVersionOf(pinned)
    if (!pinnedMinimum) continue
    for (const { label, manifest } of workspaces) {
      const declared = {
        ...manifest.peerDependencies,
        ...manifest.devDependencies,
        ...manifest.dependencies,
      }[name]
      if (!declared) continue
      const declaredMinimum = minimumVersionOf(declared)
      if (!declaredMinimum) continue
      if (compareVersions(pinnedMinimum, declaredMinimum) < 0) {
        problems.push(
          `${name}: root override pins ${pinned}, but ${label} declares ${declared}. ` +
            `Raise the override to at least ${declaredMinimum} or the declared version never installs.`,
        )
      }
    }
  }
  return problems
}

/** Collect the root manifest plus every `apps/*` and `packages/*` workspace. */
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
  // The root manifest declares its own devDependencies and is overridden too.
  const workspaces = [{ label: 'the root manifest', manifest }, ...collectWorkspaces(root)]
  return inspectOverrides(manifest, workspaces)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
  const problems = checkDependencyOverrides(root)
  if (problems.length) {
    console.error(`Dependency override check failed:\n${problems.join('\n')}`)
    process.exitCode = 1
  } else {
    console.log('No root override pins below a workspace-declared version.')
  }
}
