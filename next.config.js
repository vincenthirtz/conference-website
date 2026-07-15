/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  trailingSlash: false,
  images: {
    formats: ['image/avif', 'image/webp'],
    // Remote CDN images (Blizzard/Twitch/Discord/Supabase Storage) are
    // near-static; the 60s default causes needless re-fetch/re-encode.
    minimumCacheTTL: 86400,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'https',
        hostname: 'overwatch.blizzard.com',
      },
      {
        protocol: 'https',
        hostname: 'static-cdn.jtvnw.net',
      },
      {
        protocol: 'https',
        hostname: 'cdn.discordapp.com',
      },
    ],
  },
  /**
   * Netlify build (Turbopack) was failing to load ESM modules from supabase-js.
   * Transpile them so they're bundled correctly server-side.
   */
  transpilePackages: ['@supabase/supabase-js', '@supabase/ssr'],
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          // CSP is now set dynamically with nonces in middleware.ts
        ],
      },
    ];
  },
};

module.exports = nextConfig;
