// biome-ignore-all lint/suspicious/noUndeclaredEnvVars: Standalone Actions script; never cached by Turbo.
import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export function promotionSource(target, sha) {
  const source = { test: 'dev', pprd: 'test', prod: 'pprd' }[target]
  if (!source || !/^[a-f0-9]{40}$/.test(sha))
    throw new Error('Invalid promotion target or commit SHA')
  return source
}

export function advanceBranch(
  target,
  sha,
  git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim(),
) {
  const source = promotionSource(target, sha)
  git(
    'fetch',
    'origin',
    `refs/heads/${source}:refs/remotes/origin/${source}`,
    `refs/heads/${target}:refs/remotes/origin/${target}`,
  )
  const sourceSha = git('rev-parse', `refs/remotes/origin/${source}`)
  const previous = git('rev-parse', `refs/remotes/origin/${target}`)
  if (sourceSha !== sha)
    throw new Error(`${source} moved; validate its new commit in a fresh promotion run`)
  // This command fails on divergence. Never merge, rebase, reset, or force-push.
  git('merge-base', '--is-ancestor', previous, sha)
  git('push', 'origin', `${sha}:refs/heads/${target}`)
  const actual = git('ls-remote', 'origin', `refs/heads/${target}`).split(/\s/)[0]
  if (actual !== sha) throw new Error(`${target} did not advance to the validated commit`)
  return `${target}: ${previous} → ${sha}`
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = advanceBranch(process.env.PROMOTION_TARGET, process.env.PROMOTION_SHA)
  console.log(result)
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${result}\n`)
}
