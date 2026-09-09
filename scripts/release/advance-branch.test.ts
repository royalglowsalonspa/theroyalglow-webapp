import assert from 'node:assert/strict'
import { test } from 'vitest'
import { advanceBranch, promotionSource } from './advance-branch.mjs'

const sha = 'a'.repeat(40)
const old = 'b'.repeat(40)
test('only ordered environment promotions and full commit SHAs are accepted', () => {
  assert.equal(promotionSource('test', sha), 'dev')
  assert.equal(promotionSource('pprd', sha), 'test')
  assert.equal(promotionSource('prod', sha), 'pprd')
  assert.throws(() => promotionSource('dev', sha))
  assert.throws(() => promotionSource('prod', 'dev'))
})
test('a changed source or diverged target can never be pushed', () => {
  for (const mode of ['moved', 'diverged']) {
    const calls = []
    const git = (...args) => {
      calls.push(args)
      if (args[0] === 'rev-parse') return args[1].endsWith('/dev') && mode !== 'moved' ? sha : old
      if (args[0] === 'merge-base') throw new Error('diverged')
      return ''
    }
    assert.throws(() => advanceBranch('test', sha, git))
    assert.equal(
      calls.some((args) => args[0] === 'push'),
      false,
    )
  }
})
test('pushes only the validated SHA without force and verifies the remote', () => {
  const calls = []
  const git = (...args) => {
    calls.push(args)
    if (args[0] === 'rev-parse') return args[1].endsWith('/dev') ? sha : old
    if (args[0] === 'ls-remote') return `${sha}\trefs/heads/test`
    return ''
  }
  advanceBranch('test', sha, git)
  assert.deepEqual(
    calls.find((args) => args[0] === 'push'),
    ['push', 'origin', `${sha}:refs/heads/test`],
  )
})
