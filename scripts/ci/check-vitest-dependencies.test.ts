import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { InstalledPackage, PackageResolver } from './check-auth-dependencies'
import {
  checkVitestDependencies,
  inspectVitestDependencies,
  type VitestWorkspace,
} from './check-vitest-dependencies'

function fixture() {
  // Synthetic versions make sure the gate follows declarations and vendor
  // requirements instead of hardcoding today's release.
  const version = '9.2.4'
  const workspace = (label: string, dependencies: Record<string, string>): VitestWorkspace => ({
    label,
    path: `${label}/package.json`,
    manifest: { devDependencies: dependencies },
  })
  const pkg = (name: string, packageVersion = version): InstalledPackage => ({
    path: `${name}@${packageVersion}/package.json`,
    manifest: {
      name,
      version: packageVersion,
      peerDependencies: name === 'vitest' ? {} : { vitest: packageVersion },
    },
  })
  const root = workspace('root', { vitest: version, '@vitest/coverage-v8': version })
  const app = workspace('apps/example', { vitest: version, '@vitest/coverage-v8': version })
  const library = workspace('packages/example', { vitest: version })
  const runner = pkg('vitest')
  const provider = pkg('@vitest/coverage-v8')
  const packages = new Map([
    ['vitest', runner],
    ['@vitest/coverage-v8', provider],
  ])
  const resolver: PackageResolver = (consumer, name) => {
    const dependency = packages.get(name)
    if (!dependency) throw new Error(`Missing ${name} from ${consumer}`)
    return dependency
  }
  return { workspaces: [root, app, library], root, app, library, runner, provider, resolver, pkg }
}

describe('Vitest dependency compatibility', () => {
  it('validates the installed root and every app/package workspace', () => {
    expect(checkVitestDependencies(resolve(import.meta.dirname, '../..'))).toEqual([])
  })

  it('accepts aligned runners and coverage providers', () => {
    const { workspaces, resolver } = fixture()
    expect(inspectVitestDependencies(workspaces, resolver)).toEqual([])
  })

  it('rejects a runner-only update even if the coverage package installs as declared', () => {
    const { workspaces, app, resolver, pkg } = fixture()
    app.manifest.devDependencies = { vitest: '9.2.4', '@vitest/coverage-v8': '9.2.3' }
    const staleProvider = pkg('@vitest/coverage-v8', '9.2.3')
    const resolveStaleProvider: PackageResolver = (consumer, name) =>
      consumer === app.path && name === '@vitest/coverage-v8'
        ? staleProvider
        : resolver(consumer, name)
    expect(inspectVitestDependencies(workspaces, resolveStaleProvider)).toContain(
      'apps/example devDependencies.@vitest/coverage-v8: declares 9.2.3, but root vitest declares ' +
        '9.2.4. Update the runner and coverage providers together.',
    )
  })

  it('rejects a stale package workspace runner instead of only checking known apps', () => {
    const { workspaces, library, resolver } = fixture()
    library.manifest.devDependencies = { vitest: '9.2.3' }
    expect(inspectVitestDependencies(workspaces, resolver)).toContain(
      'packages/example devDependencies.vitest: declares 9.2.3, but root vitest declares ' +
        '9.2.4. Update the runner and coverage providers together.',
    )
  })

  it('rejects floating versions even when every declaration uses the same range', () => {
    const { workspaces, resolver } = fixture()
    for (const workspace of workspaces) {
      workspace.manifest.devDependencies = { vitest: '^9.2.4' }
    }
    expect(inspectVitestDependencies(workspaces, resolver)).toContain(
      'root devDependencies.vitest: declare an exact version, received ^9.2.4',
    )
  })

  it('checks declarations in all dependency sections without hiding duplicates', () => {
    const { workspaces, app, resolver } = fixture()
    app.manifest.dependencies = { vitest: '^9.2.4' }
    app.manifest.peerDependencies = { '@vitest/coverage-v8': '9.2.3' }
    const problems = inspectVitestDependencies(workspaces, resolver)
    expect(problems).toContain(
      'apps/example dependencies.vitest: declare an exact version, received ^9.2.4',
    )
    expect(problems).toContain(
      'apps/example peerDependencies.@vitest/coverage-v8: declares 9.2.3, but root vitest declares ' +
        '9.2.4. Update the runner and coverage providers together.',
    )
  })

  it('rejects stale installed packages behind matching declarations', () => {
    const { workspaces, app, resolver, pkg } = fixture()
    const resolveStaleRunner: PackageResolver = (consumer, name) =>
      consumer === app.path && name === 'vitest' ? pkg('vitest', '9.2.2') : resolver(consumer, name)
    expect(inspectVitestDependencies(workspaces, resolveStaleRunner)).toContain(
      'apps/example devDependencies.vitest: declares 9.2.4, resolves 9.2.2',
    )
  })

  it('resolves the coverage peer from its own package, not the workspace root', () => {
    const { workspaces, provider, resolver, pkg } = fixture()
    const resolveIsolatedPeer: PackageResolver = (consumer, name) =>
      consumer === provider.path && name === 'vitest'
        ? pkg('vitest', '9.2.1')
        : resolver(consumer, name)
    expect(inspectVitestDependencies(workspaces, resolveIsolatedPeer)).toContain(
      'root @vitest/coverage-v8@9.2.4 -> vitest: requires 9.2.4, resolves 9.2.1',
    )
  })

  it('also checks Istanbul coverage while leaving independently versioned libraries alone', () => {
    const { workspaces, root, resolver, pkg } = fixture()
    root.manifest.devDependencies = {
      vitest: '9.2.4',
      '@vitest/coverage-istanbul': '9.2.4',
      '@vitest/istanbul-lib-coverage': '^1.0.0',
    }
    const resolveIstanbul: PackageResolver = (consumer, name) =>
      name === '@vitest/coverage-istanbul' ? pkg(name) : resolver(consumer, name)
    expect(inspectVitestDependencies(workspaces, resolveIstanbul)).toEqual([])
  })

  it('reports a missing installation as an actionable failure', () => {
    const { workspaces, resolver } = fixture()
    const resolveMissingProvider: PackageResolver = (consumer, name) => {
      if (name === '@vitest/coverage-v8') throw new Error('MODULE_NOT_FOUND')
      return resolver(consumer, name)
    }
    expect(inspectVitestDependencies(workspaces, resolveMissingProvider)).toContain(
      'root -> @vitest/coverage-v8: cannot resolve installed package: MODULE_NOT_FOUND',
    )
  })

  it('cannot pass after every runner declaration is removed', () => {
    expect(inspectVitestDependencies([])).toEqual([
      'No workspace declares vitest; declare an exact runner version.',
    ])
  })
})
