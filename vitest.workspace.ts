import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineWorkspace } from 'vitest/config'

// Monorepo Vitest workspace: a Node project for pure `packages/business` logic
// and a jsdom + React project for `apps/web`. One `vitest` invocation runs both
// and shares the coverage config defined in `vitest.config.ts`.
export default defineWorkspace([
  {
    test: {
      name: 'business',
      environment: 'node',
      include: ['packages/business/**/*.test.ts'],
    },
  },
  {
    test: {
      name: 'types',
      environment: 'node',
      include: ['packages/types/**/*.test.ts'],
    },
  },
  {
    test: {
      name: 'db',
      environment: 'node',
      include: ['packages/db/**/*.test.ts'],
    },
  },
  {
    plugins: [react()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'apps/web/src'),
        // React is installed in apps/web/node_modules (not hoisted to the
        // workspace root, which is the jsdom `web` project's root). Point the
        // JSX runtime + react/react-dom at the web install so component (.tsx)
        // tests resolve `react/jsx-dev-runtime`.
        react: resolve(__dirname, 'apps/web/node_modules/react'),
        'react-dom': resolve(__dirname, 'apps/web/node_modules/react-dom'),
      },
    },
    test: {
      name: 'web',
      environment: 'jsdom',
      include: ['apps/web/**/*.test.{ts,tsx}'],
      setupFiles: ['./apps/web/src/test/setup.ts'],
    },
  },
  {
    plugins: [react()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'apps/admin/src'),
        // React is installed in apps/admin/node_modules (not hoisted to the
        // workspace root), and the jsdom `admin` project's root is the
        // workspace root. Point the JSX runtime + react/react-dom at the admin
        // install so component (.tsx) smoke tests resolve `react/jsx-dev-runtime`.
        react: resolve(__dirname, 'apps/admin/node_modules/react'),
        'react-dom': resolve(__dirname, 'apps/admin/node_modules/react-dom'),
      },
    },
    test: {
      name: 'admin',
      environment: 'jsdom',
      include: ['apps/admin/**/*.test.{ts,tsx}'],
      // jest-dom matchers for component smoke tests. Per-file
      // `@vitest-environment node` overrides (e.g. env.test.ts) still apply;
      // this import only extends `expect` and is safe in node too.
      setupFiles: ['./apps/admin/src/test/setup.ts'],
    },
  },
])
