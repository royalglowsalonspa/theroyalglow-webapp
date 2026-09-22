import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  checkAuthDependencies,
  type InstalledPackage,
  inspectAuthDependencies,
  type PackageResolver,
} from './check-auth-dependencies'

function fixture({ staleCore = false, staleInfraPeer = false, staleAdapter = false } = {}) {
  const pkg = (
    name: string,
    version: string,
    dependencies: Record<string, string> = {},
    peerDependencies: Record<string, string> = {},
  ): InstalledPackage => ({
    path: `${name}@${version}/package.json`,
    manifest: { name, version, dependencies, peerDependencies },
  })
  // Deliberately unrelated synthetic versions: the check must follow vendor
  // requirements, not hardcode the current release or align independent plugins.
  const app = pkg('app', '0.0.0', { 'better-auth': '9.2.4', '@better-auth/infra': '0.8.0' })
  const auth = pkg('better-auth', '9.2.4', {
    '@better-auth/core': '9.2.4',
    '@better-auth/drizzle-adapter': '9.2.4',
    '@better-auth/utils': '0.9.0',
  })
  const core = pkg('@better-auth/core', staleCore ? '9.2.3' : '9.2.4')
  const adapter = pkg(
    '@better-auth/drizzle-adapter',
    staleAdapter ? '9.2.3' : '9.2.4',
    {},
    {
      '@better-auth/core': '^9.2.0',
    },
  )
  const infra = pkg(
    '@better-auth/infra',
    '0.8.0',
    {},
    {
      '@better-auth/core': '>=9.0.0',
      'better-auth': '>=9.0.0',
    },
  )
  const packages = new Map(
    [app, auth, core, adapter, infra, pkg('@better-auth/utils', '0.9.0')].map((installed) => [
      installed.manifest.name,
      installed,
    ]),
  )
  const resolver: PackageResolver = (consumer, name) => {
    if (staleInfraPeer && consumer === infra.path && name === '@better-auth/core') {
      return pkg('@better-auth/core', '9.2.1')
    }
    const installed = packages.get(name)
    if (!installed) throw new Error(`Unexpected resolution: ${consumer} -> ${name}`)
    return installed
  }
  return inspectAuthDependencies(app, resolver)
}

describe('Better Auth dependency graph', () => {
  it('validates both installed application graphs', () => {
    expect(checkAuthDependencies(resolve(import.meta.dirname, '../..'))).toEqual([])
  })

  it('accepts compatible packages with independent release versions', () => {
    expect(fixture()).toEqual([])
  })

  it('rejects the stale core override that broke createWithSpan imports', () => {
    expect(fixture({ staleCore: true })).toContain(
      'better-auth@9.2.4 -> @better-auth/core: requires 9.2.4, resolves 9.2.3',
    )
  })

  it('rejects a stale bundled adapter even when the app/core versions match', () => {
    expect(fixture({ staleAdapter: true })).toContain(
      'better-auth@9.2.4 -> @better-auth/drizzle-adapter: requires 9.2.4, resolves 9.2.3',
    )
  })

  it('checks infra peer resolution from infra rather than the workspace root', () => {
    expect(fixture({ staleInfraPeer: true })).toContain(
      '@better-auth/infra@0.8.0 -> @better-auth/core: resolves 9.2.1, app core is 9.2.4',
    )
  })
})
