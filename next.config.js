/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  trailingSlash: false,
  images: {
    formats: ['image/avif', 'image/webp'],
    // Les équipes peuvent envoyer un logo SVG (cf. utils/svgSanitize.ts, qui
    // reconstruit le fichier à partir d'une liste blanche AVANT stockage).
    // L'optimiseur d'images refuse le SVG par défaut, ce qui casserait tout
    // <Image src="…​.svg">. On le réautorise avec la CSP recommandée par Next :
    // le SVG est servi en bac à sable, sans script ni ressource externe — la
    // deuxième barrière, après le nettoyage à l'upload.
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    contentSecurityPolicy:
      "default-src 'self'; script-src 'none'; sandbox; style-src 'unsafe-inline'",
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
  /**
   * La fiche d'équipe PAR TOURNOI (`/tournament/<id>/teams/<uuid>`) a été
   * supprimée : elle doublonnait la fiche globale `/team/<slug>`, en plus
   * pauvre. Les anciens liens — pages indexées, messages Discord, partages —
   * mènent désormais à la fiche globale, qui sait résoudre un UUID aussi bien
   * qu'un slug. Sans cette règle, ils tomberaient en 404.
   */
  async redirects() {
    return [
      {
        source: '/tournament/:id/teams/:teamId',
        destination: '/team/:teamId',
        permanent: true,
      },
      /**
       * Le système d'annonces (bandeau haut de home + crosspost Discord) a été
       * retiré : l'admin publie désormais par Communication › Réseaux, qui
       * couvre le même besoin en atteignant aussi le site et les réseaux.
       * Les favoris du staff sur /admin/announcements* atterrissent sur le hub.
       */
      {
        source: '/admin/announcements/:path*',
        destination: '/admin/communications',
        permanent: true,
      },
      /**
       * `/live` s'appelle `/ambassadors`. L'URL disait « le direct » alors que
       * la page présente les ambassadeur·rices — tous ses libellés le disaient
       * déjà (`t.ambassadors`, `sAmbassadors`, `linkAmbassadors`), seule
       * l'adresse ne suivait pas.
       *
       * Redirection permanente et non suppression : l'ancienne adresse est dans
       * le sitemap depuis l'origine, donc indexée, partagée et mise en favori.
       * La retirer sèchement transformerait chaque lien existant en 404.
       */
      {
        source: '/live',
        destination: '/ambassadors',
        permanent: true,
      },
    ];
  },
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
