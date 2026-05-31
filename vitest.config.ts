import { defineConfig } from 'vitest/config'

// Root Vitest config holding shared coverage settings. The per-package projects
// (a Node project for pure `packages/business` logic and a jsdom + React project
// for `apps/web`) are declared in `vitest.workspace.ts` so one `vitest`
// invocation runs both with shared coverage.
export default defineConfig({
  test: {
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
  },
})
