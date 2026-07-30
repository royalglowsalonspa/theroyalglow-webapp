/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 15-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : tests/support/env
 * Scope        : CMS E2E Support — Environment Loading
 *
 * Description  : Loads `apps/cms/.env.local` into `process.env` for the
 *                Playwright process so the suite can reach the same Neon branch
 *                the CMS itself uses.
 *
 * Responsibilities :
 * - Parse a dotenv file with no third-party dependency
 * - Never overwrite a variable already present in the environment
 *
 * Tech Stack   : Node, TypeScript
 * Layer        : CMS (Test Support)
 *
 * Notes        :
 * - `apps/cms` has NO `.env` file — only `.env.local` — which Next loads
 *   automatically for the dev server but Playwright's own process does not.
 * - Existing environment variables WIN, so a CI/shell override still applies.
 * - Deliberately minimal: `KEY=value`, `#` comments, optional surrounding
 *   quotes. No interpolation, no `export` prefixes.
 ************************************************************/
import { existsSync, readFileSync } from 'node:fs'

export function loadEnvFile(filePath: string): void {
  if (!existsSync(filePath)) {
    return
  }

  for (const rawLine of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line === '' || line.startsWith('#')) {
      continue
    }

    const separator = line.indexOf('=')
    if (separator === -1) {
      continue
    }

    const key = line.slice(0, separator).trim()
    if (key === '' || process.env[key] !== undefined) {
      continue
    }

    let value = line.slice(separator + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    process.env[key] = value
  }
}
