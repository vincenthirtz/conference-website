import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  // Generate a random nonce for each request
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');

  // Cloudflare Turnstile (anti-bot widget, /onboard pages) injects:
  //   - script depuis https://challenges.cloudflare.com/turnstile/v0/api.js
  //   - styles inline dans le widget (impossible de leur passer notre nonce)
  //   - iframe vers https://challenges.cloudflare.com/cdn-cgi/challenge-platform/...
  //   - connect vers challenges.cloudflare.com pour le challenge
  //
  // Pour style-src on doit retirer le nonce et passer en 'unsafe-inline' car
  // par spec CSP3, quand nonce est présent unsafe-inline est ignoré (donc on
  // ne peut pas avoir les deux). Trade-off acceptable : inline styles peuvent
  // pas exécuter de code, le risque XSS reste très limité. Le nonce sur
  // script-src (l'attaque principale) reste intact.
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' https://challenges.cloudflare.com`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https:`,
    `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.twitch.tv https://id.twitch.tv https://challenges.cloudflare.com`,
    `media-src 'self' https://*.supabase.co`,
    "font-src 'self'",
    "frame-src 'self' https://player.twitch.tv https://www.youtube.com https://challenges.cloudflare.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ');

  // Forward the nonce to _document via a request header
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  // Set CSP header on the response
  response.headers.set('Content-Security-Policy', csp);

  return response;
}

export const config = {
  matcher: [
    // Match all routes except static files and API routes
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico|img/).*)',
      missing: [{ type: 'header', key: 'next-router-prefetch' }],
    },
  ],
};
