import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: '/trace/:id',
        destination: '/traces/:id',
        permanent: true,
      },
    ]
  },
}

export default nextConfig
