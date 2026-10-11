import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { describe, expect, it, onTestFinished } from 'vitest'
import type { Workspace } from './check-dependency-overrides'
import {
  checkBunReleaseAgePolicy,
  inspectBunReleaseAgePolicy,
  inspectRenovatePolicy,
} from './check-renovate-policy'

type Rule = Record<string, unknown>
function fixture() {
  const root = {
    workspaces: ['apps/*', 'packages/*'],
    packageManager: 'bun@1.4.2',
    dependencies: { payload: '3.0.0', graphql: '^16.0.0', '@example/security': '^2.1.0' },
    devDependencies: { vitest: '9.0.0', '@vitest/coverage-v8': '9.0.0' },
    overrides: { '@example/security': '$@example/security' },
  }
  const workspaces: Workspace[] = [
    {
      label: 'apps/web',
      manifest: { packageManager: 'bun@1.4.2', devDependencies: { vitest: '9.0.0' } },
    },
    {
      label: 'packages/library',
      manifest: { packageManager: 'bun@1.4.2', dependencies: { vitest: '9.0.0' } },
    },
  ]
  const packageRules: Rule[] = [
    { matchManagers: ['bun'], matchUpdateTypes: ['minor', 'patch'], groupName: 'platform' },
    { matchManagers: ['github-actions', 'dockerfile'], groupName: 'tooling' },
    { matchManagers: ['bun'], matchPackageNames: ['bun'], groupName: 'tooling' },
    { matchUpdateTypes: ['major'], dependencyDashboardApproval: true },
    { matchPackageNames: ['bun'], matchUpdateTypes: ['major'], groupName: 'bun-runtime' },
    {
      matchPackageNames: ['vitest', '@vitest/*'],
      matchUpdateTypes: ['major'],
      groupName: 'vitest',
    },
    {
      matchPackageNames: ['payload', '@payloadcms/*', 'graphql'],
      matchUpdateTypes: ['major'],
      groupName: 'payload',
    },
    { matchManagers: ['dockerfile'], enabled: false },
    { matchManagers: ['dockerfile'], matchFileNames: ['apps/invoicing/Dockerfile'], enabled: true },
  ]
  const config = {
    enabledManagers: ['bun', 'github-actions', 'dockerfile'],
    baseBranchPatterns: ['dev'],
    automerge: false,
    dependencyDashboard: true,
    prConcurrentLimit: 2,
    packageRules,
    vulnerabilityAlerts: {
      enabled: true,
      automerge: false,
      minimumReleaseAge: '0 days',
      dependencyDashboardApproval: false,
      schedule: [],
    },
  }
  return { root, workspaces, config }
}

describe('native Bun release-age policy', () => {
  const protectedConfig = {
    install: { minimumReleaseAge: 259200, minimumReleaseAgeExcludes: [] },
  }

  function configFixture(rootContents?: string) {
    const prefix = resolve(tmpdir(), 'rgss-bun-policy-')
    const root = mkdtempSync(prefix)
    onTestFinished(() => {
      if (!resolve(root).startsWith(prefix)) throw new Error('Unexpected fixture directory')
      rmSync(root, { recursive: true, force: true })
    })
    if (rootContents !== undefined) writeFileSync(resolve(root, 'bunfig.toml'), rootContents)
    return root
  }

  it('requires native three-day enforcement and permits unrelated workspace settings', () => {
    expect(
      inspectBunReleaseAgePolicy(protectedConfig, [
        { file: 'apps/web/bunfig.toml', config: { test: { coverage: true } } },
        {
          file: 'packages/library/bunfig.toml',
          config: { install: { minimumReleaseAge: 259200, minimumReleaseAgeExcludes: [] } },
        },
      ]),
    ).toEqual([])
  })

  it.each([undefined, 0, 86400, 259201, '259200', false, null])(
    'rejects missing, weakened or inconsistent root age %s',
    (minimumReleaseAge) => {
      expect(inspectBunReleaseAgePolicy({ install: { minimumReleaseAge } }).join('\n')).toContain(
        'bunfig.toml: install.minimumReleaseAge must be 259200 seconds',
      )
    },
  )

  it('rejects invalid install tables instead of treating them as absent settings', () => {
    for (const config of [null, [], { install: [] }, { install: 'minimumReleaseAge=259200' }]) {
      expect(inspectBunReleaseAgePolicy(config).join('\n')).toContain('must be a TOML table')
    }
  })

  it('requires explicit empty root exclusions to override inherited global exemptions', () => {
    expect(
      inspectBunReleaseAgePolicy({ install: { minimumReleaseAge: 259200 } }).join('\n'),
    ).toContain(
      'explicitly set install.minimumReleaseAgeExcludes = [] to override inherited global exemptions',
    )
    expect(inspectBunReleaseAgePolicy(protectedConfig)).toEqual([])
  })

  it('rejects permanent package exemptions at root and workspace scope', () => {
    for (const minimumReleaseAgeExcludes of [['*'], ['posthog-node'], 'posthog-node', null]) {
      const config = { install: { minimumReleaseAge: 259200, minimumReleaseAgeExcludes } }
      expect(inspectBunReleaseAgePolicy(config).join('\n')).toContain(
        'bunfig.toml: persistent minimumReleaseAgeExcludes bypasses are forbidden',
      )
      expect(
        inspectBunReleaseAgePolicy(protectedConfig, [
          { file: 'apps/invoicing/bunfig.toml', config },
        ]).join('\n'),
      ).toContain('apps/invoicing/bunfig.toml: persistent minimumReleaseAgeExcludes')
    }
  })

  it('rejects conflicting workspace age overrides with the responsible file', () => {
    expect(
      inspectBunReleaseAgePolicy(protectedConfig, [
        { file: 'apps/admin/bunfig.toml', config: { install: { minimumReleaseAge: 0 } } },
      ]).join('\n'),
    ).toContain('apps/admin/bunfig.toml: install.minimumReleaseAge must be 259200 seconds')
  })

  it('uses native TOML semantics for quoted dotted keys, numeric separators and comments', () => {
    const root = configFixture(
      '# minimumReleaseAge = 0 is only a comment\n"install"."minimumReleaseAge" = 259_200\ninstall.minimumReleaseAgeExcludes = []\n',
    )
    expect(checkBunReleaseAgePolicy(root, [])).toEqual([])
    writeFileSync(
      resolve(root, 'bunfig.toml'),
      '# [install]\n# minimumReleaseAge = 259200\n[install]\n"minimumReleaseAge" = 0\n',
    )
    expect(checkBunReleaseAgePolicy(root, []).join('\n')).toContain('must be 259200 seconds')
  })

  it('fails closed for missing and malformed native configuration', () => {
    const root = configFixture()
    expect(checkBunReleaseAgePolicy(root, []).join('\n')).toContain('commit the native Bun')
    writeFileSync(
      resolve(root, 'bunfig.toml'),
      '[install]\nminimumReleaseAge = 259200\nminimumReleaseAge = 0\n',
    )
    expect(checkBunReleaseAgePolicy(root, []).join('\n')).toContain('could not parse native TOML')
  })

  it('discovers workspace overrides and reports malformed local TOML', () => {
    const root = configFixture(
      '[install]\nminimumReleaseAge = 259200\nminimumReleaseAgeExcludes = []\n',
    )
    const file = resolve(root, 'apps/web/bunfig.toml')
    mkdirSync(resolve(root, 'apps/web'), { recursive: true })
    writeFileSync(file, 'install.minimumReleaseAge = 0\n')
    expect(checkBunReleaseAgePolicy(root, [{ label: 'apps/web' }]).join('\n')).toContain(
      'apps/web/bunfig.toml: install.minimumReleaseAge must be 259200 seconds',
    )
    writeFileSync(file, '[install\n')
    expect(checkBunReleaseAgePolicy(root, [{ label: 'apps/web' }]).join('\n')).toContain(
      'apps/web/bunfig.toml: could not parse native TOML',
    )
  })
})

describe('Renovate workspace and PR policy', () => {
  it('accepts one platform batch across dependency types and workspace manifests', () => {
    const { root, workspaces, config } = fixture()
    expect(inspectRenovatePolicy(config, root, workspaces)).toEqual([])
  })

  it('catches later matching rules splitting production and development groups', () => {
    const { root, workspaces, config } = fixture()
    config.packageRules.push({
      matchManagers: ['bun'],
      matchDepTypes: ['devDependencies'],
      matchUpdateTypes: ['patch'],
      groupName: 'other',
    })
    expect(inspectRenovatePolicy(config, root, workspaces).join('\n')).toContain(
      'one platform group',
    )
  })

  it('honors all matches and later group restoration instead of Dependabot first-match behavior', () => {
    const { root, workspaces, config } = fixture()
    config.packageRules.unshift({ matchPackageNames: ['vitest'], groupName: 'wrong' })
    expect(inspectRenovatePolicy(config, root, workspaces)).toEqual([])
  })

  it('rejects split major upgrades of Vitest and its coverage provider', () => {
    const { root, workspaces, config } = fixture()
    config.packageRules.push({
      matchPackageNames: ['@vitest/*'],
      matchUpdateTypes: ['major'],
      groupName: 'other',
    })
    expect(inspectRenovatePolicy(config, root, workspaces).join('\n')).toContain(
      'Vitest majors must share one reviewed group',
    )
  })

  it('keeps GraphQL majors visible but gated for manual migration', () => {
    const { root, workspaces, config } = fixture()
    for (const unsafe of [{ enabled: false }, { dependencyDashboardApproval: false }]) {
      const changed = {
        ...config,
        packageRules: [
          ...config.packageRules,
          { matchPackageNames: ['graphql'], matchUpdateTypes: ['major'], ...unsafe },
        ],
      }
      expect(inspectRenovatePolicy(changed, root, workspaces).join('\n')).toMatch(
        /graphql: major updates|graphql: major upgrades/,
      )
    }
  })

  it('rejects broad dependency disables even when the referenced security override is installed', () => {
    const { root, workspaces, config } = fixture()
    config.packageRules.push({ matchPackageNames: ['@example/*'], enabled: false })
    expect(inspectRenovatePolicy(config, root, workspaces).join('\n')).toContain(
      '@example/security: patch updates must remain discoverable',
    )
  })

  it('rejects referenced overrides without an updateable direct declaration', () => {
    const { root, workspaces, config } = fixture()
    const changed = { ...root, dependencies: { payload: '3.0.0', graphql: '^16.0.0' } }
    expect(inspectRenovatePolicy(config, changed, workspaces).join('\n')).toContain(
      'needs a maintained root direct dependency',
    )
  })

  it('checks optional dependencies and native scalar overrides for hidden upgrades', () => {
    const { root, workspaces, config } = fixture()
    workspaces.push({
      label: 'apps/optional',
      manifest: {
        packageManager: 'bun@1.4.2',
        optionalDependencies: { 'optional-library': '^1.0.0' },
      },
    })
    const changed = { ...root, overrides: { ...root.overrides, 'js-yaml': '5.4.1' } }
    config.packageRules.push({ matchPackageNames: ['optional-library', 'js-yaml'], enabled: false })
    const problems = inspectRenovatePolicy(config, changed, workspaces).join('\n')
    expect(problems).toContain('optional-library: major updates must remain discoverable')
    expect(problems).toContain('js-yaml: major updates must remain discoverable')
  })

  it('rejects numeric qualified overrides that cannot regenerate the Bun lockfile', () => {
    const { root, workspaces, config } = fixture()
    const changed = { ...root, overrides: { 'undici@>=7.0.0 <7.29.1': '^7.29.1' } }
    expect(inspectRenovatePolicy(config, changed, workspaces).join('\n')).toContain(
      'version-qualified overrides need a maintained root dependency reference',
    )
    expect(
      inspectRenovatePolicy(
        config,
        {
          ...root,
          dependencies: { ...root.dependencies, undici: '^7.29.1' },
          overrides: { 'undici@>=7.0.0 <7.29.1': '$undici' },
        },
        workspaces,
      ),
    ).toEqual([])
  })

  it('requires native Bun runtime constraints on every workspace and coordinated major upgrades', () => {
    const { root, workspaces, config } = fixture()
    const workspace = workspaces[0]
    if (!workspace) throw new Error('Missing fixture workspace')
    for (const packageManager of [undefined, 'bun@1.3.0']) {
      workspace.manifest = packageManager ? { packageManager } : {}
      expect(inspectRenovatePolicy(config, root, workspaces).join('\n')).toContain(
        'packageManager must match the root Bun version',
      )
    }
    workspace.manifest.packageManager = root.packageManager
    config.packageRules.push({
      matchPackageNames: ['bun'],
      matchFileNames: ['apps/web/package.json'],
      matchUpdateTypes: ['major'],
      groupName: 'split-runtime',
    })
    expect(inspectRenovatePolicy(config, root, workspaces).join('\n')).toContain(
      'Bun major upgrades must group every workspace',
    )
    expect(
      inspectRenovatePolicy({ ...config, constraints: { bun: '1.3.0' } }, root, workspaces).join(
        '\n',
      ),
    ).toContain('not a separate constraints pin')
  })

  it('rejects allowed-version ceilings that silently hide future migrations', () => {
    const { root, workspaces, config } = fixture()
    for (const changed of [
      { ...config, allowedVersions: '<6' },
      {
        ...config,
        packageRules: [
          ...config.packageRules,
          { matchPackageNames: ['vitest'], allowedVersions: '<6' },
        ],
      },
    ])
      expect(inspectRenovatePolicy(changed, root, workspaces).join('\n')).toContain(
        'allowedVersions ceilings',
      )
  })

  it('rejects hidden workspace discovery and exclusion filters', () => {
    const { root, workspaces, config } = fixture()
    root.workspaces = ['apps/*']
    expect(inspectRenovatePolicy(config, root, workspaces).join('\n')).toContain(
      'packages/library/package.json',
    )
    for (const filter of [
      { ignorePaths: ['apps/**'] },
      { includePaths: ['package.json'] },
      { ignoreDeps: ['vitest'] },
      { bun: { managerFilePatterns: ['package.json'] } },
    ]) {
      expect(
        inspectRenovatePolicy({ ...config, ...filter }, root, workspaces).length,
      ).toBeGreaterThan(0)
    }
  })

  it('handles glob negatives and regex package rules', () => {
    const { root, workspaces, config } = fixture()
    config.packageRules.push({
      matchPackageNames: ['/^@example\\//', '!@example/security'],
      enabled: false,
    })
    expect(inspectRenovatePolicy(config, root, workspaces)).toEqual([])
    config.packageRules.push({ matchPackageNames: ['/^@example\\//'], enabled: false })
    expect(inspectRenovatePolicy(config, root, workspaces).join('\n')).toContain(
      '@example/security: patch updates',
    )
  })

  it('rejects unknown selectors instead of silently treating them as global rules', () => {
    const { root, workspaces, config } = fixture()
    config.packageRules.push({ matchJsonata: ['depName="vitest"'], enabled: false })
    expect(inspectRenovatePolicy(config, root, workspaces).join('\n')).toContain(
      'Unsupported policy selector',
    )
  })

  it('rejects dynamic groups, excessive PR limits, missing dashboard and environment targets', () => {
    const { root, workspaces, config } = fixture()
    for (const change of [
      { prConcurrentLimit: 10 },
      { prConcurrentLimit: 0 },
      { dependencyDashboard: false },
      { baseBranchPatterns: ['dev', 'prod'] },
      { automerge: true },
      { enabledManagers: ['npm'] },
    ]) {
      expect(
        inspectRenovatePolicy({ ...config, ...change }, root, workspaces).length,
      ).toBeGreaterThan(0)
    }
    config.packageRules.push({ matchPackageNames: ['*'], groupName: '{{depName}}' })
    expect(inspectRenovatePolicy(config, root, workspaces).join('\n')).toContain(
      'must not split by templated',
    )
  })

  it('rejects conditional automerge or blocking routine approval', () => {
    const { root, workspaces, config } = fixture()
    for (const unsafe of [{ automerge: true }, { dependencyDashboardApproval: true }]) {
      expect(
        inspectRenovatePolicy(
          {
            ...config,
            packageRules: [...config.packageRules, { matchUpdateTypes: ['patch'], ...unsafe }],
          },
          root,
          workspaces,
        ).length,
      ).toBeGreaterThan(0)
    }
  })

  it('retains active Docker/Actions coverage and excludes obsolete containers', () => {
    const { root, workspaces, config } = fixture()
    const withoutDockerRouting = {
      ...config,
      packageRules: config.packageRules.filter((rule) => rule.enabled === undefined),
    }
    expect(inspectRenovatePolicy(withoutDockerRouting, root, workspaces).join('\n')).toContain(
      'exclude retired container paths',
    )
    config.packageRules.push({ matchManagers: ['github-actions'], enabled: false })
    expect(inspectRenovatePolicy(config, root, workspaces).join('\n')).toContain(
      '.github/workflows/ci.yml',
    )
  })

  it('keeps Renovate security proposals immediate and reviewed while Bun artifact age remains enforced', () => {
    const { root, workspaces, config } = fixture()
    for (const unsafe of [
      { enabled: false },
      { automerge: true },
      { minimumReleaseAge: '3 days' },
      { dependencyDashboardApproval: true },
      { schedule: ['* * * * 1'] },
    ]) {
      expect(
        inspectRenovatePolicy(
          { ...config, vulnerabilityAlerts: { ...config.vulnerabilityAlerts, ...unsafe } },
          root,
          workspaces,
        ).join('\n'),
      ).toContain('Renovate security proposals must bypass')
    }
  })

  it('reports malformed policy objects and invalid regex patterns', () => {
    const { root, workspaces, config } = fixture()
    expect(inspectRenovatePolicy(null, root, workspaces)).toEqual([
      'Renovate packageRules must be an array.',
    ])
    config.packageRules.push({ matchPackageNames: ['/[bad/'] })
    expect(inspectRenovatePolicy(config, root, workspaces).join('\n')).toContain(
      'Invalid matching pattern',
    )
  })

  it('collects and validates the actual repository configuration with Bun', () => {
    const cwd = resolve(import.meta.dirname, '../..')
    const output = execFileSync('bun', ['run', 'scripts/ci/check-renovate-policy.ts'], {
      cwd,
      encoding: 'utf8',
      timeout: 30000,
    })
    expect(output).toContain('Renovate maintains one shared Bun workspace')
  })
})
