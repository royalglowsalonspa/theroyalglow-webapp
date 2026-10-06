import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  type InstalledPackage,
  type PackageResolver,
  resolveInstalledPackage,
} from './check-auth-dependencies'
import { collectWorkspaces, type Manifest, type Workspace } from './check-dependency-overrides'

export type VitestWorkspace = Workspace & { path: string }

// Coverage providers use Vitest's internal APIs and require the same release.
// Do not include every @vitest/* package: the Istanbul libraries, for example,
// have independent versions.
const coupledPackages = new Set(['vitest', '@vitest/coverage-v8', '@vitest/coverage-istanbul'])
const isExactVersion = (version: string) =>
  /^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/.test(version)

/** Check declarations and consumer-specific resolution, including Bun's peer installations. */
export function inspectVitestDependencies(
  workspaces: VitestWorkspace[],
  resolvePackage: PackageResolver = resolveInstalledPackage,
): string[] {
  const problems: string[] = []
  const declarations = workspaces.flatMap((workspace) =>
    (['dependencies', 'devDependencies', 'peerDependencies'] as const).flatMap((section) =>
      Object.entries(workspace.manifest[section] ?? {})
        .filter(([name]) => coupledPackages.has(name))
        .map(([name, required]) => ({ workspace, section, name, required })),
    ),
  )
  // The root is collected first, so its runner sets the shared release.
  const reference = declarations.find(({ name }) => name === 'vitest')
  if (!reference) return ['No workspace declares vitest; declare an exact runner version.']

  function installed(consumer: string, name: string, label: string): InstalledPackage | undefined {
    try {
      return resolvePackage(consumer, name)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      problems.push(`${label} -> ${name}: cannot resolve installed package: ${message}`)
      return undefined
    }
  }

  for (const { workspace, section, name, required } of declarations) {
    const label = `${workspace.label} ${section}.${name}`
    if (!isExactVersion(required)) {
      problems.push(`${label}: declare an exact version, received ${required}`)
    }
    if (required !== reference.required) {
      problems.push(
        `${label}: declares ${required}, but ${reference.workspace.label} vitest declares ` +
          `${reference.required}. Update the runner and coverage providers together.`,
      )
    }

    const dependency = installed(workspace.path, name, workspace.label)
    if (!dependency) continue
    if (isExactVersion(required) && dependency.manifest.version !== required) {
      problems.push(`${label}: declares ${required}, resolves ${dependency.manifest.version}`)
    }
    if (name === 'vitest') continue

    const providerLabel = `${workspace.label} ${name}@${dependency.manifest.version}`
    const runner = installed(workspace.path, 'vitest', workspace.label)
    const peer = installed(dependency.path, 'vitest', providerLabel)
    if (runner && dependency.manifest.version !== runner.manifest.version) {
      problems.push(
        `${providerLabel}: requires matching vitest, workspace resolves ${runner.manifest.version}`,
      )
    }
    if (peer && peer.manifest.version !== dependency.manifest.version) {
      problems.push(
        `${providerLabel} -> vitest: resolves ${peer.manifest.version}; provider and runner must match`,
      )
    }
    const peerRequirement = dependency.manifest.peerDependencies?.vitest
    if (peer && peerRequirement && isExactVersion(peerRequirement)) {
      if (peer.manifest.version !== peerRequirement) {
        problems.push(
          `${providerLabel} -> vitest: requires ${peerRequirement}, resolves ${peer.manifest.version}`,
        )
      }
    }
  }
  return problems
}

export function checkVitestDependencies(root: string): string[] {
  const path = resolve(root, 'package.json')
  const manifest: Manifest = JSON.parse(readFileSync(path, 'utf8'))
  const workspaces = [
    { label: 'root', path, manifest },
    ...collectWorkspaces(root).map((workspace) => ({
      ...workspace,
      path: resolve(root, workspace.label, 'package.json'),
    })),
  ]
  return inspectVitestDependencies(workspaces)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
  const problems = checkVitestDependencies(root)
  if (problems.length) {
    console.error(`Vitest dependency compatibility failed:\n${problems.join('\n')}`)
    process.exitCode = 1
  } else {
    console.log(
      'Vitest runners and coverage providers have matching declared and installed versions.',
    )
  }
}
