import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  // Generate a random nonce for each request
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    `style-src 'self' 'nonce-${nonce}'`,
    `img-src 'self' data: blob: https:`,
    `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.twitch.tv https://id.twitch.tv`,
    `media-src 'self' https://*.supabase.co`,
    "font-src 'self'",
    "frame-src 'self' https://player.twitch.tv https://www.youtube.com",
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
