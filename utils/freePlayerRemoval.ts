// utils/freePlayerRemoval.ts
//
// Lien de retrait d'une fiche « joueuse libre » publiée depuis /rejoindre.
//
// POURQUOI un token signé plutôt qu'un compte : l'inscription se fait SANS
// COMPTE — c'est tout l'intérêt du parcours. Il faut donc un moyen de prouver
// « c'est bien moi » sans session, et sans transformer le retrait en formulaire
// où n'importe qui pourrait saisir l'email d'une autre pour la faire
// disparaître de la liste. Le lien arrive par email : le posséder prouve
// l'accès à la boîte, ce qui est exactement la même garantie que l'inscription.
//
// Forme du token : base64url(payload) "." base64url(sig)
//   - payload = JSON { f: freePlayerId, v: 1 }
//   - sig     = HMAC-SHA256(payload_b64, secret)
//
// Le champ `f` (et non `u`/`e`) rend ces tokens NON-interchangeables avec ceux
// de utils/emailUnsubscribe.ts : un lien de désabonnement email ne peut pas
// servir à supprimer une fiche, et réciproquement.
//
// Pas d'expiry : une fiche périme au bout de 60 jours, mais le lien doit rester
// valable tant qu'elle existe. Rotation du secret = anciens liens invalidés,
// acceptable (la joueuse peut demander le retrait au staff).
//
// NB : troisième implémentation de ce schéma HMAC dans le dépôt (avec
// emailUnsubscribe.ts et captcha.ts). Volontairement dupliquée plutôt que
// factorisée à chaud : extraire un `signedToken` générique demanderait de
// toucher deux modules déjà en production, pour un gain cosmétique.

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

/** Token auto-portant autorisant le retrait de CETTE fiche, et d'elle seule. */
export function generateFreePlayerRemovalToken(freePlayerId: string): string {
  const payloadB64 = b64url(
    Buffer.from(
      JSON.stringify({ f: freePlayerId, v: TOKEN_VERSION }),
      'utf8'
    )
  );
  return `${payloadB64}.${sign(payloadB64, getSecret())}`;
}

/**
 * Vérifie un token de retrait. Retourne l'id de la fiche si la signature est
 * valide et le payload bien formé, sinon `null` (absent, malformé, altéré,
 * version inconnue, ou token d'une autre famille). Comparaison à temps
 * constant.
 */
export function verifyFreePlayerRemovalToken(token: string): string | null {
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
      f?: unknown;
      v?: unknown;
    };
    if (payload.v !== TOKEN_VERSION) return null;
    if (typeof payload.f !== 'string' || payload.f.length === 0) return null;
    return payload.f;
  } catch {
    return null;
  }
}

/** URL publique du retrait, telle qu'envoyée dans l'email de confirmation. */
export function buildFreePlayerRemovalUrl(freePlayerId: string): string {
  const origin = (
    process.env.SITE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'https://owwomenscup.fr'
  ).replace(/\/+$/, '');
  const token = generateFreePlayerRemovalToken(freePlayerId);
  return `${origin}/rejoindre/retrait?token=${encodeURIComponent(token)}`;
}
