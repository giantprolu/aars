import withSerwistInit from '@serwist/next';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return [
      {
        // Aucune donnée métier ne doit être mise en cache côté client (AD-5).
        source: '/api/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store' }],
      },
    ];
  },
};

const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  // Le précache ne contient que la coquille : aucune route /api n'y entre.
  exclude: [/^api\//, /\.map$/],
  disable: process.env.NODE_ENV === 'development',
});

export default withSerwist(nextConfig);
