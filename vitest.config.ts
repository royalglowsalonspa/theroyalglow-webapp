import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { configDefaults, defineConfig } from 'vitest/config'

// Root Vitest config. Holds shared coverage settings plus the per-package
// projects (Vitest 4 `test.projects`, which replaces the old
// `vitest.workspace.ts`): a Node project for pure logic packages and
// jsdom + React projects for `apps/web` and `apps/admin`. One `vitest`
// invocation runs them all with shared coverage.

// Suites that touch REAL infrastructure. The three under
// `packages/db/scripts/drift/__tests__/` FORK LIVE NEON BRANCHES via the Neon
// API whenever `isDriftForkAvailable()` sees both DATABASE_URL and
// NEON_API_KEY — which is the normal state of a developer machine. They must
// therefore be opt-in, never collected by accident.
//
// This protection used to live ONLY in the root `test` npm script, as
// `--exclude '**/*.integration.test.*'`. That left the obvious command
// `bunx vitest run packages/db/scripts/drift` free to collect and RUN them,
// which is how a stray local invocation forked branches until Neon answered
// BRANCHES_LIMIT_EXCEEDED. A guard that only one script honours is not a guard,
// so it now lives in the config every invocation loads.
const LIVE_SUITE_GLOBS = ['**/*.integration.test.*']

type RootConfigOptions = {
  // Opt back IN to the live suites. Set ONLY by vitest.integration.config.ts,
  // which `bun run test:integration` passes via `--config`.
  includeLiveSuites?: boolean
}

// Exported as a factory so the deliberate opt-in path can reuse the exact same
// projects (same includes, aliases, setup files) with one flag flipped, instead
// of maintaining a second, drifting copy of them.
export function createRootConfig({ includeLiveSuites = false }: RootConfigOptions = {}) {
  // Project-level `exclude` REPLACES the Vitest defaults rather than extending
  // them, so the defaults (node_modules, dist, …) are spread back in explicitly.
  const exclude = includeLiveSuites
    ? [...configDefaults.exclude]
    : [...configDefaults.exclude, ...LIVE_SUITE_GLOBS]

  return defineConfig({
    test: {
      // Root-level only, and deliberately duplicated per project below. Verified
      // by experiment: when `test.projects` is set, a root-level `test.exclude`
      // is NOT inherited by the projects — the drift integration files were
      // still collected with only this line in place. It is kept because it is
      // what a plain non-project `vitest` invocation would honour, but the
      // per-project `exclude` entries are the ones that actually do the work.
      exclude,
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html'],
        reportsDirectory: './coverage',
        exclude: [
          '**/*.config.*',
          '**/e2e/**',
          '**/payload-types.ts',
          '**/.next/**',
          '**/node_modules/**',
          '**/*.test.*',
          '**/dist/**',
        ],
      },
      projects: [
        {
          test: {
            name: 'business',
            environment: 'node',
            include: ['packages/business/**/*.test.ts'],
            exclude,
          },
        },
        {
          test: {
            name: 'types',
            environment: 'node',
            include: ['packages/types/**/*.test.ts'],
            exclude,
          },
        },
        {
          test: {
            name: 'logger',
            environment: 'node',
            include: ['packages/logger/**/*.test.ts'],
            exclude,
          },
        },
        {
          test: {
            name: 'errors',
            environment: 'node',
            include: ['packages/errors/**/*.test.ts'],
            exclude,
          },
        },
        {
          test: {
            name: 'db',
            environment: 'node',
            include: ['packages/db/**/*.test.ts'],
            // This is the project that owns the Neon-forking drift suites, so
            // the exclusion matters most here.
            exclude,
          },
        },
        {
          test: {
            name: 'cms',
            environment: 'node',
            // Payload collections/hooks are server-side only — no jsdom, no React
            // plugin. `.next` is excluded explicitly because the Vitest defaults
            // do not cover it and the CMS build output contains vendored tests.
            include: ['apps/cms/**/*.test.ts'],
            exclude: [...exclude, '**/.next/**'],
            // Run CMS test FILES one at a time. Two of them
            // (`sync-atomicity.test.ts`, `scripts/__tests__/seed-services.test.ts`)
            // are integration suites that boot Payload against the SAME database,
            // so running them concurrently would let one suite's throwaway rows
            // appear inside the other's assertions, and would double the pooled
            // Neon connections for no gain. The remaining CMS files are fast
            // pure-logic tests, so serialising costs very little.
            fileParallelism: false,
          },
        },
        {
          plugins: [react()],
          resolve: {
            alias: {
              '@': resolve(__dirname, 'apps/web/src'),
              // React is installed in apps/web/node_modules (not hoisted to the
              // workspace root). Point the JSX runtime + react/react-dom at the
              // web install so component (.tsx) tests resolve react/jsx-dev-runtime.
              react: resolve(__dirname, 'apps/web/node_modules/react'),
              'react-dom': resolve(__dirname, 'apps/web/node_modules/react-dom'),
            },
          },
          test: {
            name: 'web',
            environment: 'jsdom',
            include: ['apps/web/**/*.test.{ts,tsx}'],
            exclude,
            setupFiles: ['./apps/web/src/test/setup.ts'],
          },
        },
        {
          plugins: [react()],
          resolve: {
            alias: {
              '@': resolve(__dirname, 'apps/admin/src'),
              // React is installed in apps/admin/node_modules (not hoisted to the
              // workspace root). Point the JSX runtime + react/react-dom at the
              // admin install so component (.tsx) smoke tests resolve react/jsx-dev-runtime.
              react: resolve(__dirname, 'apps/admin/node_modules/react'),
              'react-dom': resolve(__dirname, 'apps/admin/node_modules/react-dom'),
            },
          },
          test: {
            name: 'admin',
            environment: 'jsdom',
            include: ['apps/admin/**/*.test.{ts,tsx}'],
            exclude,
            setupFiles: ['./apps/admin/src/test/setup.ts'],
          },
        },
      ],
    },
  })
}

export default createRootConfig()
