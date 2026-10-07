import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { inspectDependabotPolicy } from './check-dependabot-policy'
import type { Workspace } from './check-dependency-overrides'

function fixture() {
  const root = {
    workspaces: ['apps/*', 'packages/*'],
    devDependencies: {
      vitest: '9.0.0',
      '@vitest/coverage-v8': '9.0.0',
      '@example/security': '^2.1.0',
    },
    overrides: { '@example/security': '$@example/security' },
  }
  const workspaces: Workspace[] = [
    { label: 'apps/web', manifest: { devDependencies: { vitest: '9.0.0' } } },
    { label: 'packages/library', manifest: { dependencies: { vitest: '9.0.0' } } },
  ]
  const entry = {
    'package-ecosystem': 'bun',
    directory: '/',
    'target-branch': 'dev',
    groups: {
      tests: { patterns: ['vitest', '@vitest/*'], 'update-types': ['major', 'minor', 'patch'] },
    },
  }
  const config = { version: 2, updates: [entry] }
  return { root, workspaces, entry, config }
}

describe('Dependabot workspace maintenance policy', () => {
  it('accepts a single root scan covering coupled packages in different dependency sections', () => {
    const { root, workspaces, config } = fixture()
    expect(inspectDependabotPolicy(config, root, workspaces)).toEqual([])
  })

  it('rejects the overlapping root and child scans that created duplicate Motion/MSW PRs', () => {
    const { root, workspaces, entry } = fixture()
    const config = { updates: [{ ...entry, directories: ['/', '/apps/*', '/packages/*'] }] }
    expect(inspectDependabotPolicy(config, root, workspaces)).toContain(
      'Bun must scan directory "/" only; child scans duplicate workspace updates.',
    )
    expect(
      inspectDependabotPolicy(
        { updates: [entry, { ...entry, directory: '/apps/web' }] },
        root,
        workspaces,
      ),
    ).toContain('Use one Bun update entry for the shared workspace and bun.lock.')
  })

  it('rejects workspace manifests the root scan cannot discover', () => {
    const { root, workspaces, config } = fixture()
    root.workspaces = ['apps/*']
    expect(inspectDependabotPolicy(config, root, workspaces).join('\n')).toContain(
      'packages/library',
    )
    root.workspaces = ['apps/*', 'packages/*', '!packages/library']
    expect(inspectDependabotPolicy(config, root, workspaces).join('\n')).toContain(
      'packages/library',
    )
  })

  it('rejects discovery filters that silently drop dependency maintenance', () => {
    const { root, workspaces, entry } = fixture()
    for (const filter of [
      { allow: [{ 'dependency-name': 'vitest' }] },
      { 'exclude-paths': ['apps/*'] },
    ]) {
      expect(
        inspectDependabotPolicy({ updates: [{ ...entry, ...filter }] }, root, workspaces).join(
          '\n',
        ),
      ).toContain('discovery must cover all direct dependencies')
    }
  })

  it('catches a catch-all group shadowing a coupled group through first-match ordering', () => {
    const { root, workspaces, entry } = fixture()
    const config = {
      updates: [
        {
          ...entry,
          groups: {
            production: { 'dependency-type': 'production', patterns: ['*'] },
            ...entry.groups,
          },
        },
      ],
    }
    expect(inspectDependabotPolicy(config, root, workspaces).join('\n')).toContain(
      'Vitest major updates must share one group',
    )
  })

  it('rejects grouping a runner while excluding its coverage provider or major upgrades', () => {
    const { root, workspaces, entry } = fixture()
    for (const group of [
      { patterns: ['vitest'] },
      { patterns: ['vitest', '@vitest/*'], 'update-types': ['minor', 'patch'] },
      { patterns: ['vitest', '@vitest/*'], 'exclude-patterns': ['@vitest/coverage-*'] },
      { patterns: ['vitest', '@vitest/*'], 'group-by': 'dependency-name' },
    ]) {
      expect(
        inspectDependabotPolicy(
          { updates: [{ ...entry, groups: { tests: group } }] },
          root,
          workspaces,
        ).join('\n'),
      ).toContain('Vitest major updates must share one group')
    }
  })

  it('does not require unrelated Motion/MSW majors to enter a combined group', () => {
    const { root, workspaces, config } = fixture()
    workspaces.push({
      label: 'apps/admin',
      manifest: { dependencies: { motion: '^13.0.0', msw: '^2.0.0' } },
    })
    expect(inspectDependabotPolicy(config, root, workspaces)).toEqual([])
  })

  it('rejects dangling override references that Dependabot cannot maintain', () => {
    const { root, workspaces, config } = fixture()
    root.overrides['@example/security'] = '$@example/missing'
    expect(inspectDependabotPolicy(config, root, workspaces).join('\n')).toContain(
      'needs a root direct dependency',
    )
  })

  it('rejects security reference ignores that block patch/minor or selected versions', () => {
    const { root, workspaces, entry } = fixture()
    for (const ignore of [
      { 'dependency-name': '@example/*' },
      { 'dependency-name': '@example/security', 'update-types': ['version-update:semver-patch'] },
      { 'dependency-name': '@example/security', versions: ['2.x'] },
    ]) {
      expect(
        inspectDependabotPolicy(
          { updates: [{ ...entry, ignore: [ignore] }] },
          root,
          workspaces,
        ).join('\n'),
      ).toContain('ignore hides updates to a referenced security override')
    }
    const ignore = [
      { 'dependency-name': '@example/security', 'update-types': ['version-update:semver-major'] },
    ]
    expect(inspectDependabotPolicy({ updates: [{ ...entry, ignore }] }, root, workspaces)).toEqual(
      [],
    )
  })

  it('rejects malformed or missing Bun update configuration and an environment target', () => {
    const { root, workspaces, entry } = fixture()
    expect(inspectDependabotPolicy(null, root, workspaces)).toEqual([
      'Dependabot updates must be an array.',
    ])
    expect(inspectDependabotPolicy({ updates: [] }, root, workspaces).join('\n')).toContain(
      'one Bun update entry',
    )
    expect(
      inspectDependabotPolicy(
        { updates: [{ ...entry, 'target-branch': 'prod' }] },
        root,
        workspaces,
      ),
    ).toContain('Bun dependency updates must target dev.')
  })

  it('keeps GraphQL minor/patch updates in the Payload schema family', () => {
    const { root, workspaces, entry } = fixture()
    workspaces.push({
      label: 'apps/cms',
      manifest: { dependencies: { payload: '8.2.0', graphql: '^25.1.0' } },
    })
    const ignore = [
      { 'dependency-name': 'graphql', 'update-types': ['version-update:semver-major'] },
    ]
    const groups = {
      ...entry.groups,
      payload: { patterns: ['payload', '@payloadcms/*'], 'update-types': ['minor', 'patch'] },
      production: { 'dependency-type': 'production', 'update-types': ['minor', 'patch'] },
    }
    expect(
      inspectDependabotPolicy({ updates: [{ ...entry, groups, ignore }] }, root, workspaces).join(
        '\n',
      ),
    ).toContain('Payload minor updates must share one group')
    groups.payload.patterns.push('graphql')
    expect(
      inspectDependabotPolicy({ updates: [{ ...entry, groups, ignore }] }, root, workspaces),
    ).toEqual([])
  })

  it('requires manual GraphQL major migration without hiding compatible minor/patch updates', () => {
    const { root, workspaces, entry } = fixture()
    workspaces.push({
      label: 'apps/cms',
      manifest: { dependencies: { payload: '8.2.0', graphql: '^25.1.0' } },
    })
    const groups = {
      ...entry.groups,
      payload: {
        patterns: ['payload', '@payloadcms/*', 'graphql'],
        'update-types': ['minor', 'patch'],
      },
    }
    for (const ignore of [
      [],
      [{ 'dependency-name': 'graphql' }],
      [
        {
          'dependency-name': 'graphql',
          'update-types': ['version-update:semver-major', 'version-update:semver-patch'],
        },
      ],
    ]) {
      expect(
        inspectDependabotPolicy({ updates: [{ ...entry, groups, ignore }] }, root, workspaces).join(
          '\n',
        ),
      ).toContain('GraphQL majors require an explicit manual Payload migration')
    }
  })
  it('validates the actual YAML and root workspace manifests with the Bun CLI', () => {
    const cwd = resolve(import.meta.dirname, '../..')
    const output = execFileSync('bun', ['run', 'scripts/ci/check-dependabot-policy.ts'], {
      cwd,
      encoding: 'utf8',
      timeout: 30000,
    })
    expect(output).toContain('Dependabot discovers one Bun workspace')
  })
})
