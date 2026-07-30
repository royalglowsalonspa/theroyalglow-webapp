import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Root Vitest config. Holds shared coverage settings plus the per-package
// projects (Vitest 4 `test.projects`, which replaces the old
// `vitest.workspace.ts`): a Node project for pure logic packages and
// jsdom + React projects for `apps/web` and `apps/admin`. One `vitest`
// invocation runs them all with shared coverage.
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
    projects: [
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
        test: {
          name: 'cms',
          environment: 'node',
          // Payload collections/hooks are server-side only — no jsdom, no React
          // plugin. `.next` is excluded explicitly because the Vitest defaults
          // do not cover it and the CMS build output contains vendored tests.
          include: ['apps/cms/**/*.test.ts'],
          exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**'],
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
          setupFiles: ['./apps/admin/src/test/setup.ts'],
        },
      },
    ],
  },
})
