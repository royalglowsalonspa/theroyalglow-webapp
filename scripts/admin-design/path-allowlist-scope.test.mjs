import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyAdminChange } from './path-allowlist-scope.mjs'

const feature = 'feat/branch-calendar'
const requirements = '.kiro/specs/branch-calendar/requirements.md'
const design = '.kiro/specs/branch-calendar/design.md'
const files = [
  requirements,
  design,
  'apps/admin/src/app/calendar/page.tsx',
  'apps/admin/src/app/api/calendar/route.ts',
  'packages/db/src/schema/calendar.ts',
]
const isPresent = (path) => files.includes(path)

test('identifies a mixed change with a matching feature branch, requirements and design', () => {
  assert.equal(classifyAdminChange(feature, files, isPresent), 'feature')
  assert.equal(classifyAdminChange('codex/branch-calendar', files, isPresent), 'feature')
})

test('requires a matching PR head ref and both feature documents in the diff', () => {
  for (const head of [undefined, 'fix/branch-calendar', 'feat/other-spec', 'codex/other-spec']) {
    assert.equal(classifyAdminChange(head, files, isPresent), 'unspecified')
  }
  for (const head of [feature, 'codex/branch-calendar']) {
    assert.equal(classifyAdminChange(head, [requirements], isPresent), 'unspecified')
    assert.equal(
      classifyAdminChange(head, files, (path) => path !== design),
      'unspecified',
    )
  }
})

test('preserves strict validation when the diff touches the redesign spec', () => {
  const redesign = '.kiro/specs/admin-portal-redesign/requirements.md'
  assert.equal(classifyAdminChange(feature, [...files, redesign], isPresent), 'redesign')
})

test('preserves strict validation for redesign branches with matching spec documents', () => {
  for (const name of ['admin-portal-redesign', 'admin-redesign-dashboard', 'admin-design-system']) {
    const docs = [`.kiro/specs/${name}/requirements.md`, `.kiro/specs/${name}/design.md`]
    for (const prefix of ['feat', 'codex']) {
      assert.equal(
        classifyAdminChange(`${prefix}/${name}`, docs, () => true),
        'redesign',
      )
    }
  }
})
