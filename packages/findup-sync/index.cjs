'use strict'

// Adapted from findup-sync 4.0.0 (MIT); see LICENSE and README.md.
const fs = require('node:fs')
const path = require('node:path')
const detect = require('detect-file')
const isGlob = require('is-glob')
const picomatch = require('picomatch')
const resolveDir = require('resolve-dir')

/**
 * Find the first matching entry, starting at cwd and walking toward its root.
 * @param {string | string[]} patterns
 * @param {import('./index.cjs').Options} [options]
 * @returns {string | null}
 */
module.exports = function findupSync(patterns, options = {}) {
  const opts = options || {}
  const searches = typeof patterns === 'string' ? [patterns] : patterns
  if (!Array.isArray(searches)) {
    throw new TypeError('findup-sync expects a string or array as the first argument.')
  }
  let cwd = path.resolve(resolveDir(opts.cwd || ''))
  const matchers = searches.map((pattern) => (isGlob(pattern) ? picomatch(pattern, opts) : null))

  // Both filesystem traversal and Picomatch's pattern parser are iterative.
  // No recursive brace AST from micromatch/braces is installed or executed.
  while (true) {
    for (let index = 0; index < searches.length; index++) {
      const pattern = searches[index]
      if (pattern === undefined) continue
      const matcher = matchers[index]
      if (matcher) {
        for (const name of readEntries(cwd)) {
          const candidate = path.join(cwd, name)
          if (matcher(name) || matcher(candidate)) return candidate
        }
      } else {
        const candidate = detect(path.resolve(cwd, pattern), opts)
        if (candidate) return candidate
      }
    }
    const parent = path.dirname(cwd)
    if (parent === cwd) return null
    cwd = parent
  }
}

/** @param {string} directory @returns {string[]} */
function readEntries(directory) {
  try {
    return fs.readdirSync(directory)
  } catch {
    // Preserve findup-sync's handling of missing/unreadable directories.
    return []
  }
}
