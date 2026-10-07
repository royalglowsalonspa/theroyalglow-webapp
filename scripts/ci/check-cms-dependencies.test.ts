import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { InstalledPackage, PackageResolver } from './check-auth-dependencies'
import { checkCMSDependencies, inspectCMSDependencies } from './check-cms-dependencies'

function fixture() {
  const pkg = (
    name: string,
    version: string,
    dependencies = {},
    peerDependencies = {},
  ): InstalledPackage => ({
    path: `${name}@${version}/package.json`,
    manifest: { name, version, dependencies, peerDependencies },
  })
  const app = pkg('@rgss/cms', '1.0.0', {
    payload: '8.2.0',
    '@payloadcms/next': '8.2.0',
    graphql: '^25.1.0',
  })
  const graphql = pkg('graphql', '25.1.0')
  const payload = pkg('payload', '8.2.0', {}, { graphql: '^25.0.0' })
  const next = pkg(
    '@payloadcms/next',
    '8.2.0',
    { '@payloadcms/graphql': '8.2.0' },
    { graphql: '^25.0.0' },
  )
  const schema = pkg(
    '@payloadcms/graphql',
    '8.2.0',
    { 'graphql-http': '^1.0.0', 'graphql-scalars': '^2.0.0' },
    { graphql: '^25.0.0' },
  )
  const http = pkg('graphql-http', '1.0.0', {}, { graphql: '^25.0.0' })
  const scalars = pkg('graphql-scalars', '2.0.0', {}, { graphql: '^25.0.0' })
  const packages = new Map(
    [graphql, payload, next, schema, http, scalars].map((value) => [value.manifest.name, value]),
  )
  const overrides = new Map<string, InstalledPackage>()
  const resolver: PackageResolver = (consumer, name) => {
    const installed = overrides.get(`${consumer}:${name}`) ?? packages.get(name)
    if (!installed) throw new Error(`Missing ${name}`)
    return installed
  }
  return { app, graphql, payload, next, schema, http, scalars, packages, overrides, resolver, pkg }
}

describe('CMS Payload/GraphQL compatibility', () => {
  it('validates the real installation without connecting to Payload or a database', () => {
    expect(checkCMSDependencies(resolve(import.meta.dirname, '../..'))).toEqual([])
  })

  it('accepts one compatible GraphQL copy across the installed schema graph', () => {
    const { app, resolver } = fixture()
    expect(inspectCMSDependencies(app, resolver)).toEqual([])
  })

  it('rejects an app-only major upgrade even when Bun gives Payload a compatible isolated peer', () => {
    const { app, overrides, resolver, pkg } = fixture()
    app.manifest.dependencies = { ...app.manifest.dependencies, graphql: '^26.0.0' }
    overrides.set(`${app.path}:graphql`, pkg('graphql', '26.0.0'))
    const problems = inspectCMSDependencies(app, resolver).join('\n')
    expect(problems).toContain('requires ^25.0.0, but CMS declares ^26.0.0')
    expect(problems).toContain('separate 25.1.0 copy; CMS uses 26.0.0')
  })

  it('rejects a declaration admitting unsupported future majors despite a compatible current lockfile', () => {
    const { app, resolver } = fixture()
    app.manifest.dependencies = { ...app.manifest.dependencies, graphql: '>=25.1.0' }
    expect(inspectCMSDependencies(app, resolver).join('\n')).toContain('but CMS declares >=25.1.0')
  })

  it('checks the installed GraphQL version against the app declaration and vendor requirements', () => {
    const { app, packages, resolver, pkg } = fixture()
    packages.set('graphql', pkg('graphql', '24.9.0'))
    const problems = inspectCMSDependencies(app, resolver).join('\n')
    expect(problems).toContain('declares ^25.1.0, resolves 24.9.0')
    expect(problems).toContain('outside ^25.0.0')
  })

  it('rejects duplicate same-version schema realms', () => {
    const { app, schema, graphql, overrides, resolver } = fixture()
    overrides.set(`${schema.path}:graphql`, { ...graphql, path: 'isolated/graphql/package.json' })
    expect(inspectCMSDependencies(app, resolver).join('\n')).toContain(
      'Share one GraphQL installation',
    )
  })

  it('also follows HTTP and scalar consumer contracts rather than checking only Payload', () => {
    const { app, http, resolver } = fixture()
    http.manifest.peerDependencies = { graphql: '^24.0.0' }
    expect(inspectCMSDependencies(app, resolver).join('\n')).toContain(
      'graphql-http@1.0.0 -> graphql: requires ^24.0.0',
    )
  })

  it('rejects independently updated direct and internal Payload packages', () => {
    const { app, schema, resolver } = fixture()
    app.manifest.dependencies = { ...app.manifest.dependencies, '@payloadcms/next': '^8.2.0' }
    schema.manifest.version = '8.3.0'
    const problems = inspectCMSDependencies(app, resolver).join('\n')
    expect(problems).toContain('CMS @payloadcms/next: declares ^8.2.0')
    expect(problems).toContain('@payloadcms/graphql@8.3.0: CMS Payload resolves 8.2.0')
  })

  it('reports a missing installation without treating a failed resolution as a pass', () => {
    const { app, packages, resolver } = fixture()
    packages.delete('graphql-scalars')
    expect(inspectCMSDependencies(app, resolver).join('\n')).toContain(
      'cannot resolve installed package: Missing graphql-scalars',
    )
  })

  it('does not hardcode GraphQL 16 when a future Payload release supports a new major', () => {
    const { app, packages, resolver, pkg } = fixture()
    app.manifest.dependencies = { ...app.manifest.dependencies, graphql: '^26.0.0' }
    packages.set('graphql', pkg('graphql', '26.0.0'))
    for (const installed of packages.values()) {
      if (installed.manifest.peerDependencies?.graphql)
        installed.manifest.peerDependencies.graphql = '^26.0.0'
    }
    expect(inspectCMSDependencies(app, resolver)).toEqual([])
  })

  it('fails visibly for missing declarations and for a vendor graph with no schema contract', () => {
    const { app, packages, resolver } = fixture()
    for (const installed of packages.values()) installed.manifest.peerDependencies = {}
    expect(inspectCMSDependencies(app, resolver).join('\n')).toContain(
      'exposes no GraphQL contract',
    )
    app.manifest.dependencies = {}
    expect(inspectCMSDependencies(app, resolver)).toEqual([
      'CMS must declare an exact Payload version.',
      'CMS must declare a GraphQL SemVer range.',
    ])
  })
})
