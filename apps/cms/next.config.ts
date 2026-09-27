import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // TypeScript 7 has no JavaScript Compiler API. Make Next run the
  // project-local native `tsc` CLI for build-time validation instead.
  experimental: {
    useTypeScriptCli: true,
  },
  // Standalone output produces a minimal self-contained .next/standalone folder
  // that includes only the files needed at runtime (no node_modules). Required
  // for lean Docker images (Koyeb free nano = 256 MB RAM). The server is started
  // with `node .next/standalone/apps/cms/server.js` instead of `next start`.
  output: 'standalone',
}

export default withPayload(nextConfig)
