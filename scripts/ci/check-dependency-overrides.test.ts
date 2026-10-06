import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  checkDependencyOverrides,
  compareVersions,
  inspectOverrides,
  minimumVersionOf,
  type Workspace,
} from './check-dependency-overrides'

// Synthetic versions keep the regression tests independent of today's updates.
function fixture(
  override: string,
  declared: string,
  {
    key = 'widget',
    name = 'widget',
    installed,
  }: { key?: string; name?: string; installed?: string } = {},
): string[] {
  const workspaces: Workspace[] = [
    {
      label: 'apps/example',
      manifest: { name: '@rgss/example', dependencies: { [name]: declared } },
    },
  ]
  return inspectOverrides(
    { overrides: { [key]: override } },
    workspaces,
    installed === undefined ? undefined : () => installed,
  )
}

describe('compareVersions', () => {
  it('orders numeric components and partial versions', () => {
    expect(compareVersions('0.29.6', '0.29.10')).toBe(-1)
    expect(compareVersions('4.13.8', '4.13.7')).toBe(1)
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0)
    expect(compareVersions('1.2', '1.2.0')).toBe(0)
    expect(compareVersions('2', '1.9.9')).toBe(1)
  })

  it('orders prereleases numerically and below stable releases', () => {
    expect(compareVersions('1.0.0-rc.1', '1.0.0')).toBe(-1)
    expect(compareVersions('1.0.0', '1.0.0-rc.1')).toBe(1)
    expect(compareVersions('1.0.0-rc.2', '1.0.0-rc.10')).toBe(-1)
  })
})

describe('minimumVersionOf', () => {
  it('understands exact, compound and union SemVer ranges', () => {
    expect(minimumVersionOf('1.2.3')).toBe('1.2.3')
    expect(minimumVersionOf('^1.2.3')).toBe('1.2.3')
    expect(minimumVersionOf('~1.2.3')).toBe('1.2.3')
    expect(minimumVersionOf('>=1.2.3')).toBe('1.2.3')
    expect(minimumVersionOf('1.0.0-rc.1')).toBe('1.0.0-rc.1')
    expect(minimumVersionOf('>=1.2.3 <2.0.0')).toBe('1.2.3')
    expect(minimumVersionOf('^1.2.3 || ^2.0.0')).toBe('1.2.3')
  })

  it('declines non-version specifiers and unsatisfiable ranges', () => {
    for (const range of ['workspace:*', 'latest', 'catalog:', 'github:org/repo', '>2 <1']) {
      expect(minimumVersionOf(range), range).toBeNull()
    }
  })
})

describe('inspectOverrides', () => {
  it('rejects the stale exact override that prevented a declared upgrade', () => {
    expect(fixture('0.29.5', '^0.29.6')).toEqual([
      'widget: root override widget requires 0.29.5, but apps/example declares ^0.29.6. ' +
        'The override cannot install a version at or above 0.29.6.',
    ])
  })

  it('preserves deliberate upward security overrides', () => {
    expect(fixture('0.29.6', '^0.29.6', { installed: '0.29.6' })).toEqual([])
    expect(fixture('0.30.0', '0.29.6', { installed: '0.30.0' })).toEqual([])
  })

  it('accepts a caret that resolves a release above its declared minimum', () => {
    expect(fixture('^1.2.3', '^1.2.9', { installed: '1.3.0' })).toEqual([])
  })

  it('rejects stale resolution even when both ranges admit an adequate release', () => {
    expect(fixture('^1.2.3', '^1.2.9', { installed: '1.2.3' })).toEqual([
      'apps/example -> widget: declares ^1.2.9, resolves 1.2.3 (below 1.2.9). ' +
        'Refresh the override and lockfile together.',
    ])
  })

  it('rejects bounded overrides that cannot reach the declared floor', () => {
    expect(fixture('>=1.0.0 <2.0.0', '^3.0.0')).toHaveLength(1)
    expect(fixture('~1.2.3', '^1.3.0')).toHaveLength(1)
  })

  it('checks scoped keys instead of treating the selector as part of the package name', () => {
    expect(fixture('1.2.3', '^1.2.9', { key: 'widget@>=1.0.0 <2.0.0' })).toHaveLength(1)
    expect(
      fixture('1.2.3', '^1.2.9', {
        key: '@vendor/widget@>=1.0.0 <2.0.0',
        name: '@vendor/widget',
      }),
    ).toHaveLength(1)
  })

  it('matches selectors against declared ranges, allowing patched resolved versions outside them', () => {
    expect(
      fixture('^7.2.1', '7.2.0', {
        key: 'widget@>=7.0.0 <7.2.1',
        installed: '7.3.0',
      }),
    ).toEqual([])
  })

  it('leaves a newer major outside a scoped security override', () => {
    expect(
      fixture('^7.2.1', '^8.1.0', {
        key: 'widget@>=7.0.0 <7.2.1',
        installed: '8.2.0',
      }),
    ).toEqual([])
  })

  it('still catches an incorrectly installed old major when the selector does not apply', () => {
    expect(
      fixture('^7.2.1', '^8.1.0', {
        key: 'widget@>=7.0.0 <7.2.1',
        installed: '7.3.0',
      }),
    ).toEqual([
      'apps/example -> widget: declares ^8.1.0, resolves 7.3.0 (below 8.1.0). ' +
        'Refresh the override and lockfile together.',
    ])
  })

  it('detects a lockfile that has not applied the override security floor', () => {
    expect(fixture('^1.3.0', '^1.2.0', { installed: '1.2.5' })).toEqual([
      'apps/example -> widget: resolves 1.2.5, outside root override widget: ^1.3.0.',
    ])
  })

  it('reports unsupported selector syntax visibly', () => {
    expect(fixture('1.2.3', '^1.2.9', { key: 'widget@latest' })).toEqual([
      'Unsupported dependency override key widget@latest; extend the override check first.',
    ])
    expect(fixture('1.2.3', '^1.2.9', { key: 'parent>widget' })).toHaveLength(1)
  })

  it('resolves each workspace separately, including peer and dev dependencies', () => {
    const workspaces: Workspace[] = [
      { label: 'packages/ui', manifest: { peerDependencies: { widget: '^2.1.0' } } },
      { label: 'apps/tooling', manifest: { devDependencies: { widget: '^2.3.0' } } },
    ]
    const problems = inspectOverrides(
      { overrides: { widget: '^2.0.0' } },
      workspaces,
      (workspace) => (workspace.label === 'packages/ui' ? '2.1.0' : '2.2.0'),
    )
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('apps/tooling -> widget: declares ^2.3.0, resolves 2.2.0')
  })

  it('reports failed or invalid resolutions', () => {
    const workspaces: Workspace[] = [
      { label: 'apps/example', manifest: { dependencies: { widget: '^1.0.0' } } },
    ]
    expect(
      inspectOverrides({ overrides: { widget: '^1.0.0' } }, workspaces, () => {
        throw new Error('missing package')
      }),
    ).toEqual(['apps/example -> widget: cannot resolve installed package: missing package'])
    expect(fixture('^1.0.0', '^1.0.0', { installed: 'unknown' })).toEqual([
      'apps/example -> widget: invalid installed version unknown',
    ])
  })

  it('ignores non-overridden packages and non-version requirements', () => {
    const workspaces: Workspace[] = [
      { label: 'apps/example', manifest: { dependencies: { untouched: '^9.9.9' } } },
    ]
    expect(inspectOverrides({ overrides: { widget: '1.0.0' } }, workspaces)).toEqual([])
    expect(fixture('1.0.0', 'workspace:*')).toEqual([])
  })
})

describe('the committed root manifest and installation', () => {
  it('has no override installing below a workspace-declared version', () => {
    expect(checkDependencyOverrides(resolve(import.meta.dirname, '../..'))).toEqual([])
  })
})
