import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// The CSP template is static except for the per-request nonce (script-src) and
// frame-ancestors (embed vs strict). We precompute the static portions once at
// module load so each request only concatenates the two variable parts, instead
// of rebuilding the directive array + join on every call.
//
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
const CSP_STATIC_HEAD = "default-src 'self'; script-src 'self' 'nonce-";
// Everything between the nonce and the (variable) frame-ancestors directive.
const CSP_STATIC_MID =
  "' https://challenges.cloudflare.com; " +
  [
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https:`,
    `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.twitch.tv https://id.twitch.tv https://challenges.cloudflare.com`,
    `media-src 'self' https://*.supabase.co`,
    "font-src 'self'",
    "frame-src 'self' https://player.twitch.tv https://www.youtube.com https://challenges.cloudflare.com",
    // PWA /admin: allow Service Worker (/sw.js) and Web App Manifest from same origin.
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ') +
  '; ';

export function proxy(request: NextRequest) {
  // Generate a random nonce for each request
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');

  // T7: pages under /embed/* are public, read-only widgets (e.g. the bracket
  // iframe at /embed/tournament/[id]/bracket) designed to be embedded on
  // third-party sites/streams. Only this prefix may be framed by any origin;
  // every other route keeps the strict anti-clickjacking posture below.
  const isEmbed = request.nextUrl.pathname.startsWith('/embed');
  // frame-ancestors: '*' allows any parent to iframe the embed pages.
  // Everywhere else stays 'none' (no framing at all).
  const frameAncestors = isEmbed
    ? 'frame-ancestors *'
    : "frame-ancestors 'none'";

  // Only the nonce and frame-ancestors vary per request; the rest is hoisted
  // to module-level constants above. Output is byte-identical to the previous
  // array-join build (see CSP_STATIC_HEAD / CSP_STATIC_MID).
  const csp =
    CSP_STATIC_HEAD +
    nonce +
    CSP_STATIC_MID +
    frameAncestors +
    '; upgrade-insecure-requests';

  // Forward the nonce to _document via a request header
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  // Set CSP header on the response
  response.headers.set('Content-Security-Policy', csp);

  // T7: X-Frame-Options (set globally to ALLOW-FROM in netlify.toml) is a
  // legacy header that modern browsers treat as DENY/SAMEORIGIN when the value
  // isn't a plain SAMEORIGIN/DENY — it would block third-party iframing of the
  // embed pages regardless of CSP. Strip it for /embed/* so frame-ancestors
  // (above) is the sole, authoritative framing policy there. Everywhere else
  // the netlify.toml header is untouched.
  if (isEmbed) {
    response.headers.delete('X-Frame-Options');
  }

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
