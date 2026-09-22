import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

type Manifest = {
  name: string
  version: string
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}
export type InstalledPackage = { path: string; manifest: Manifest }
export type PackageResolver = (consumer: string, name: string) => InstalledPackage

function readManifest(path: string): Manifest {
  return JSON.parse(readFileSync(path, 'utf8')) as Manifest
}

/** Resolve from the importing consumer, including Bun's isolated peer installations. */
export const resolveInstalledPackage: PackageResolver = (consumer, name) => {
  let directory = dirname(realpathSync(createRequire(consumer).resolve(name)))
  while (true) {
    const path = resolve(directory, 'package.json')
    if (existsSync(path)) {
      const manifest = readManifest(path)
      if (manifest.name === name) return { path, manifest }
    }
    const parent = dirname(directory)
    if (parent === directory) throw new Error(`Cannot locate ${name} manifest from ${consumer}`)
    directory = parent
  }
}

const isAuthPackage = (name: string) => name === 'better-auth' || name.startsWith('@better-auth/')
const isExactVersion = (version: string) => /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version)

/** No fixed release number: validate the requirements published by the installed vendor. */
export function inspectAuthDependencies(
  app: InstalledPackage,
  resolvePackage: PackageResolver = resolveInstalledPackage,
): string[] {
  const problems: string[] = []
  const auth = resolvePackage(app.path, 'better-auth')
  const core = resolvePackage(auth.path, '@better-auth/core')
  const visited = new Set<string>()

  function visit(consumer: InstalledPackage) {
    if (visited.has(consumer.path)) return
    visited.add(consumer.path)
    const requirements = {
      ...consumer.manifest.peerDependencies,
      ...consumer.manifest.dependencies,
    }
    for (const [name, required] of Object.entries(requirements)) {
      if (!isAuthPackage(name)) continue
      const installed = resolvePackage(consumer.path, name)
      const label = `${consumer.manifest.name}@${consumer.manifest.version} -> ${name}`
      if (isExactVersion(required) && installed.manifest.version !== required) {
        problems.push(`${label}: requires ${required}, resolves ${installed.manifest.version}`)
      }
      // Infra/adapters accept broad peer ranges, but they must use this app's core.
      if (name === '@better-auth/core' && installed.manifest.version !== core.manifest.version) {
        problems.push(
          `${label}: resolves ${installed.manifest.version}, app core is ${core.manifest.version}`,
        )
      }
      if (name === 'better-auth' && installed.manifest.version !== auth.manifest.version) {
        problems.push(
          `${label}: resolves ${installed.manifest.version}, app auth is ${auth.manifest.version}`,
        )
      }
      visit(installed)
    }
  }

  visit(app)
  return problems
}

export function checkAuthDependencies(root: string): string[] {
  const apps = ['web', 'admin'].map((app) => {
    const path = resolve(root, `apps/${app}/package.json`)
    return { path, manifest: readManifest(path) }
  })
  const problems = apps.flatMap((app) => inspectAuthDependencies(app))
  for (const name of ['better-auth', '@better-auth/infra']) {
    const versions = apps.map((app) => app.manifest.dependencies?.[name])
    if (versions.some((version) => !version || !isExactVersion(version))) {
      problems.push(`Both apps must declare an exact ${name} version`)
    }
    if (new Set(versions).size !== 1) problems.push(`Web/admin ${name} versions differ`)
  }
  return problems
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
  const problems = checkAuthDependencies(root)
  if (problems.length) {
    console.error(`Better Auth dependency compatibility failed:\n${problems.join('\n')}`)
    process.exitCode = 1
  } else {
    console.log('Better Auth dependency compatibility passed for web and admin.')
  }
}
