/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
  /**
   * Netlify build (Turbopack) was failing to load ESM modules from supabase-js.
   * Transpile them so they’re bundled correctly server-side.
   */
  transpilePackages: ['@supabase/supabase-js', '@supabase/ssr'],
};

module.exports = nextConfig;
