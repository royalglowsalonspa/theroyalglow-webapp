import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Standalone output produces a minimal self-contained .next/standalone folder
  // that includes only the files needed at runtime (no node_modules). Required
  // for lean Docker images (Koyeb free nano = 256 MB RAM). The server is started
  // with `node .next/standalone/apps/cms/server.js` instead of `next start`.
  output: 'standalone',
}

export default withPayload(nextConfig)
