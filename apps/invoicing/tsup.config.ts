/************************************************************
 * Author       : KATABATHUNI BOSE
 *
 * Project      : theroyalglow-webapp
 * Module Name  : invoicing/tsup.config
 * Scope        : Build (bundler config)
 *
 * Description  : Bundles the standalone invoicing service into a single ESM
 *                file for Cloud Run. The @rgss/* workspace packages are pure
 *                TypeScript source (their package.json `exports` point at
 *                ./src/index.ts), so they are INLINED into the bundle here —
 *                this is why the final Docker image does not need the monorepo
 *                or `bun install` of the workspaces.
 *
 *                The heavy third-party deps are kept EXTERNAL and installed as
 *                runtime node_modules in the final image (smaller, faster
 *                bundle; native/large deps stay un-bundled).
 ************************************************************/
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'dist',
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  // Inline the workspace packages (TS source) into the bundle.
  noExternal: [/^@rgss\//],
  // Keep the heavy npm deps as runtime externals (installed in the image).
  external: [
    '@react-pdf/renderer',
    '@aws-sdk/client-s3',
    'hono',
    '@hono/node-server',
    '@sentry/node',
    'react',
  ],
  clean: true,
  minify: true,
  sourcemap: false,
  // react-jsx automatic runtime for the @react-pdf template.
  esbuildOptions(options) {
    options.jsx = 'automatic'
    options.jsxImportSource = 'react'
  },
})
