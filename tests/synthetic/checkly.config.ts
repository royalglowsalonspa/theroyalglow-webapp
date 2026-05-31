import { defineConfig } from 'checkly'
import { Frequency } from 'checkly/constructs'

// Checkly synthetic-monitoring project config for Royal Glow Salon & Spa.
//
// This is delivered as CODE. Activating these checks is an OPS step: it needs
// a Checkly account + `npx checkly deploy` (see `launch-checklist.md`). The
// `checkly` package is a root devDependency only — nothing here is part of the
// app build, and `tests/synthetic/` is not imported by any workspace.
//
// The five checks (see `observability.md` Layer 5) live in `*.check.ts` files
// next to this config and are discovered via `checks.checkMatch`. They target
// `process.env.CHECKLY_TARGET_URL ?? 'https://theroyalglow.in'`, so the same
// scripts run against prod by default or against a preview URL in CI/ops.

// Base URL for the monitored app. Checks read this directly too; setting it as
// the Playwright `baseURL` default lets browser checks use relative paths.
const TARGET_URL = process.env.CHECKLY_TARGET_URL ?? 'https://theroyalglow.in'

export default defineConfig({
  projectName: 'Royal Glow Salon & Spa',
  logicalId: 'rgss',
  checks: {
    // Sensible per-check defaults; each check overrides its own frequency to
    // match the schedule documented in `observability.md`.
    frequency: Frequency.EVERY_10M,
    // Mumbai + Singapore — closest Checkly regions to the India-first audience.
    locations: ['ap-south-1', 'ap-southeast-1'],
    runtimeId: '2025.04',
    tags: ['rgss', 'synthetic'],
    // `checkMatch` is resolved relative to THIS config file's directory
    // (`tests/synthetic/`), so the glob is intentionally `**/*.check.ts`.
    checkMatch: '**/*.check.ts',
    browserChecks: {
      // Default Playwright base URL for browser checks; individual checks also
      // read `CHECKLY_TARGET_URL` so they work when run standalone.
      playwrightConfig: {
        use: {
          baseURL: TARGET_URL,
        },
      },
    },
  },
  cli: {
    // Default ad-hoc `checkly test` run location.
    runLocation: 'ap-south-1',
  },
})
