import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Standalone Vitest config for the docs (Fumadocs) package. Runs the pure
// logic tests (`lib/*.test.ts`) and the jsdom + React component tests
// (`components/**/*.test.tsx`) in one invocation.
//
// The global fast-check run count (>= 100 iterations) and the jest-dom matchers
// are registered in `test/setup.ts`. Property tests carry the
// `Feature: docs-theming-and-versioning, Property N: ...` tag comment.
export default defineConfig({
  plugins: [react()],
  resolve: {
    // Array form so the more specific `@/.source/server` alias is matched
    // before the general `@` alias. The generated `@/.source/server` module
    // statically imports raw MDX, which Vite 5 (bundled by Vitest 2.x) cannot
    // transform — the fumadocs Vite MDX plugin needs Vite 7/8. The shim loads
    // the same real content via the fumadocs dynamic runtime (Node + esbuild)
    // so `@/lib/source` runs unchanged under test. See test/source-server.shim.ts.
    alias: [
      {
        find: '@/.source/server',
        replacement: resolve(__dirname, 'test/source-server.shim.ts'),
      },
      { find: '@', replacement: resolve(__dirname, '.') },
    ],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    // No test files exist yet: the property/unit suites land in later (optional)
    // tasks. Don't fail the checkpoint run on an empty suite.
    passWithNoTests: true,
    include: ['**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/.next/**', '**/.source/**'],
    setupFiles: ['./test/setup.ts'],
  },
})
