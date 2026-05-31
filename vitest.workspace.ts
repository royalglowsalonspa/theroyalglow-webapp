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
    plugins: [react()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'apps/web/src'),
      },
    },
    test: {
      name: 'web',
      environment: 'jsdom',
      include: ['apps/web/**/*.test.{ts,tsx}'],
      setupFiles: ['./apps/web/src/test/setup.ts'],
    },
  },
])
