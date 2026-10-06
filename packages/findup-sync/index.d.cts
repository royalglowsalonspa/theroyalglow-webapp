import type picomatch from 'picomatch'

declare function findupSync(
  patterns: string | string[],
  options?: findupSync.Options,
): string | null

declare namespace findupSync {
  type Options = picomatch.Options & { cwd?: string }
}

export = findupSync
