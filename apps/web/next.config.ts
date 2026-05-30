import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@rgss/business', '@rgss/db', '@rgss/errors', '@rgss/logger', '@rgss/types'],
}

export default nextConfig
