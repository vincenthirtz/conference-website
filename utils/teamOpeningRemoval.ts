// utils/teamOpeningRemoval.ts
//
// Lien de retrait d'une annonce « cette équipe cherche une joueuse ».
//
// Miroir de `utils/freePlayerRemoval.ts`, et pour la même raison : la
// publication se fait SANS COMPTE. Il faut donc prouver « c'est bien nous »
// sans session, et sans transformer le retrait en formulaire où n'importe qui
// pourrait saisir le nom d'une équipe pour la faire disparaître. Le lien arrive
// par email : le posséder prouve l'accès à la boîte, soit exactement la
// garantie qui a servi à publier.
//
// Forme du token : base64url(payload) "." base64url(sig)
//   - payload = JSON { o: teamOpeningId, v: 1 }
//   - sig     = HMAC-SHA256(payload_b64, secret)
//
// Le champ `o` (et non `f` comme les fiches joueuses, ni `u`/`e` comme les
// désabonnements email) rend ces tokens NON-interchangeables entre familles :
// un lien de retrait de fiche joueuse ne peut pas supprimer une annonce
// d'équipe, et réciproquement.
//
// Pas d'expiry : une annonce périme au bout de 60 jours, mais le lien doit
// rester valable tant qu'elle existe.

import crypto from 'crypto';

const TOKEN_VERSION = 1;

function getSecret(): string {
  return (
    process.env.UNSUBSCRIBE_SECRET ||
    process.env.CRON_SECRET ||
    'dev-unsubscribe-secret'
  );
}

function b64url(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

function sign(payloadB64: string, secret: string): string {
  return b64url(
    crypto.createHmac('sha256', secret).update(payloadB64).digest()
  );
}

/** Token auto-portant autorisant le retrait de CETTE annonce, et d'elle seule. */
export function generateTeamOpeningRemovalToken(openingId: string): string {
  const payloadB64 = b64url(
    Buffer.from(JSON.stringify({ o: openingId, v: TOKEN_VERSION }), 'utf8')
  );
  return `${payloadB64}.${sign(payloadB64, getSecret())}`;
}

/**
 * Vérifie un token de retrait. Retourne l'id de l'annonce si la signature est
 * valide et le payload bien formé, sinon `null` (absent, malformé, altéré,
 * version inconnue, ou token d'une autre famille). Comparaison à temps
 * constant.
 */
export function verifyTeamOpeningRemovalToken(token: string): string | null {
  if (typeof token !== 'string' || token.length === 0) return null;
  const dot = token.indexOf('.');
  if (dot <= 0 || dot === token.length - 1) return null;

  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);
  const expectedSig = sign(payloadB64, getSecret());

  let sigBuf: Buffer;
  let expectedBuf: Buffer;
  try {
    sigBuf = b64urlDecode(sigB64);
    expectedBuf = b64urlDecode(expectedSig);
  } catch {
    return null;
  }
  if (
    sigBuf.length !== expectedBuf.length ||
    !crypto.timingSafeEqual(sigBuf, expectedBuf)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(b64urlDecode(payloadB64).toString('utf8')) as {
      o?: unknown;
      v?: unknown;
    };
    if (payload.v !== TOKEN_VERSION) return null;
    if (typeof payload.o !== 'string' || payload.o.length === 0) return null;
    return payload.o;
  } catch {
    return null;
  }
}

/**
 * URL publique du retrait, telle qu'envoyée dans l'email de confirmation.
 *
 * `/recrutement/retrait` est le pendant de `/rejoindre/retrait` : la page de
 * confirmation vit avec le formulaire qui a créé l'annonce (`/recrutement`).
 */
export function buildTeamOpeningRemovalUrl(openingId: string): string {
  const origin = (
    process.env.SITE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'https://owwomenscup.fr'
  ).replace(/\/+$/, '');
  const token = generateTeamOpeningRemovalToken(openingId);
  return `${origin}/recrutement/retrait?token=${encodeURIComponent(token)}`;
}
