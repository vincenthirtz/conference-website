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

const CONNECT_SRC_BASE =
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.twitch.tv https://id.twitch.tv https://challenges.cloudflare.com";
// Cockpit caster web (/admin/caster) UNIQUEMENT : pilotage d'OBS en local
// (obs-websocket sur ws://localhost:4455) + chat IRC et EventSub Twitch en
// WebSocket direct. Le loopback en clair depuis une page HTTPS est permis par
// les navigateurs Chromium (origine « potentially trustworthy ») ; le reste du
// site garde le connect-src strict ci-dessus.
const CONNECT_SRC_CASTER_COCKPIT =
  CONNECT_SRC_BASE +
  ' ws://localhost:4455 ws://127.0.0.1:4455 wss://irc-ws.chat.twitch.tv wss://eventsub.wss.twitch.tv';

// Scène `camera` du cockpit caster : captation d'un opérateur DISTANT intégrée
// par un lien. Deux élargissements, appliqués UNIQUEMENT aux surfaces caster
// (cockpit + overlays), cf. isCasterSurface plus bas :
//   - frame-src + vdo.ninja : WebRTC sub-seconde, seule option réellement temps
//     réel pour un caméraman distant (Twitch/YouTube sont déjà autorisés, mais
//     avec 5-15 s de latence).
//   - media-src + https: : un flux HLS/MP4 vient d'un serveur de captation dont
//     l'hôte n'est pas connu à l'avance (il change d'un événement à l'autre).
//     Même posture que `img-src ... https:` déjà en place : ce sont des médias
//     affichés, pas du script — et la portée reste limitée aux pages caster.
const FRAME_SRC_BASE =
  "frame-src 'self' https://player.twitch.tv https://www.twitch.tv https://www.youtube.com https://challenges.cloudflare.com";
const FRAME_SRC_CASTER = `${FRAME_SRC_BASE} https://vdo.ninja https://*.vdo.ninja`;
const MEDIA_SRC_BASE = `media-src 'self' https://*.supabase.co`;
const MEDIA_SRC_CASTER = `${MEDIA_SRC_BASE} https: blob:`;

// Everything between the nonce and the (variable) frame-ancestors directive.
// Precomputed for each variant (cf. buildCspMid).
const buildCspMid = (
  connectSrc: string,
  opts: { casterMedia?: boolean } = {}
) =>
  "' https://challenges.cloudflare.com; " +
  [
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https:`,
    connectSrc,
    opts.casterMedia ? MEDIA_SRC_CASTER : MEDIA_SRC_BASE,
    "font-src 'self'",
    // player.twitch.tv = lecteur vidéo (site public + régie) ; www.twitch.tv =
    // embed du chat Twitch (console régie broadcast live). Hosts distincts.
    opts.casterMedia ? FRAME_SRC_CASTER : FRAME_SRC_BASE,
    // PWA /admin: allow Service Worker (/sw.js) and Web App Manifest from same origin.
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ') +
  '; ';

const CSP_STATIC_MID = buildCspMid(CONNECT_SRC_BASE);
// Cockpit : connect-src élargi (OBS/IRC/EventSub) ET médias caméra.
const CSP_CASTER_COCKPIT_MID = buildCspMid(CONNECT_SRC_CASTER_COCKPIT, {
  casterMedia: true,
});
// Overlays : mêmes médias caméra que le cockpit — c'est là que le flux est rendu
// — PLUS `https:` en connect-src, sans quoi la scène `camera` ne lirait pas un
// flux HLS tiers : hls.js télécharge manifeste et segments en XHR, donc soumis à
// connect-src (et non à media-src, qui ne couvre que le chargement natif par
// <video>). Sans cet ajout, seul un .m3u8 same-origin fonctionnerait.
//
// Portée du risque : les overlays sont des pages PUBLIQUES sans secret (elles
// lisent `caster_scenes` avec la clé anon, publiable par conception) et sans
// aucune entrée utilisateur — la donnée affichée est écrite par du staff
// authentifié. Leur surface autorise déjà `img-src https:` et `media-src https:`.
// L'élargissement reste scopé à `/overlay/*` : ni le cockpit, ni l'admin, ni le
// site public ne le reçoivent.
const CONNECT_SRC_OVERLAY = `${CONNECT_SRC_BASE} https:`;
const CSP_OVERLAY_MID = buildCspMid(CONNECT_SRC_OVERLAY, {
  casterMedia: true,
});

export function proxy(request: NextRequest) {
  // Generate a random nonce for each request
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');

  // T7: pages under /embed/* are public, read-only widgets (e.g. the bracket
  // iframe at /embed/tournament/[id]/bracket) designed to be embedded on
  // third-party sites/streams. Only this prefix may be framed by any origin;
  // every other route keeps the strict anti-clickjacking posture below.
  const isEmbed = request.nextUrl.pathname.startsWith('/embed');
  // Overlays caster (`/overlay/*`) : le cockpit /admin/caster en affiche un
  // APERÇU dans une iframe same-origin — ce que voit le caster est alors
  // littéralement la page qui part à l'antenne, sans plomberie de données.
  // 'self' suffit : notre propre admin peut cadrer, aucune origine tierce.
  // (Un site tiers voulant afficher un overlay passe par /embed/*, prévu pour.)
  // Sans effet sur OBS : une Browser Source charge la page directement, pas
  // dans une iframe, donc frame-ancestors ne s'y applique pas.
  const isOverlay = request.nextUrl.pathname.startsWith('/overlay');
  // frame-ancestors: '*' allows any parent to iframe the embed pages.
  // Everywhere else stays 'none' (no framing at all).
  const frameAncestors = isEmbed
    ? 'frame-ancestors *'
    : isOverlay
      ? "frame-ancestors 'self'"
      : "frame-ancestors 'none'";

  // Cockpit caster web : connect-src élargi (OBS local + IRC/EventSub Twitch)
  // et PAS de upgrade-insecure-requests — la directive upgraderait ws:// en
  // wss:// et casserait la connexion à l'OBS local. Scopé au strict préfixe.
  const isCasterCockpit = request.nextUrl.pathname.startsWith('/admin/caster');

  // Only the nonce, the CSP variant and frame-ancestors vary per request; the
  // rest is hoisted to module-level constants above. Output is byte-identical
  // to the previous array-join build for every route outside the cockpit and
  // the overlays (see CSP_STATIC_HEAD / CSP_STATIC_MID).
  const cspMid = isCasterCockpit
    ? CSP_CASTER_COCKPIT_MID
    : isOverlay
      ? CSP_OVERLAY_MID
      : CSP_STATIC_MID;

  const csp =
    CSP_STATIC_HEAD +
    nonce +
    cspMid +
    frameAncestors +
    (isCasterCockpit ? '' : '; upgrade-insecure-requests');

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
  //
  // Idem pour /overlay/* (aperçu same-origin dans le cockpit caster) : la spec
  // CSP2+ veut qu'un navigateur IGNORE X-Frame-Options dès que frame-ancestors
  // est présent, mais on ne s'appuie pas sur cette précédence pour un en-tête à
  // valeur invalide — même prudence que pour /embed. `frame-ancestors 'self'`
  // reste la protection effective. NB : ce header est posé par netlify.toml,
  // donc absent en `next dev` — l'écart ne se voit qu'en prod.
  if (isEmbed || isOverlay) {
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
