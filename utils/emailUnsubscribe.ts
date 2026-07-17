// utils/emailUnsubscribe.ts
//
// One-click unsubscribe pour le canal EMAIL des notifications. Un token signé
// HMAC-SHA256 encode le userId, sans état serveur ni table dédiée : le lien
// est cliqué depuis un email (GET /api/email/unsubscribe?token=...), donc il
// doit être auto-portant et vérifiable sans cookie.
//
// Forme du token : base64url(payload) "." base64url(sig)
//   - payload = JSON { u: userId, v: 1 }  (version pour évolution future)
//   - sig     = HMAC-SHA256(payload_b64, secret)
//
// Secret : UNSUBSCRIBE_SECRET si défini, sinon CRON_SECRET (déjà présent en
// prod pour les crons). Pas d'expiry : un opt-out reste valable indéfiniment
// — un lien ancien doit toujours fonctionner. La rotation du secret invalide
// les anciens liens, ce qui est acceptable (l'user peut re-régler ses prefs).
//
// Signature VERROUILLÉE par contrat (consommée par utils/emailDispatcher.ts) :
//   generateUnsubscribeToken(userId: string): string
//
// Variante EMAIL (destinataires SANS compte auth, ex. adhérent·es HelloAsso) :
//   generateEmailUnsubscribeToken(email: string): string
//   verifyEmailUnsubscribeToken(token: string): string | null
// Même schéma HMAC, mais le payload porte le champ `e` (email en minuscules) au
// lieu de `u` (userId) — ce qui rend les deux familles de tokens distinguables
// et non-interchangeables. L'opt-out email-only vit dans broadcast_email_optouts.

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

/**
 * Génère un token de désabonnement signé pour un user. Auto-portant : encode
 * le userId + une signature HMAC. Pas d'expiry.
 */
export function generateUnsubscribeToken(userId: string): string {
  const secret = getSecret();
  const payloadB64 = b64url(
    Buffer.from(JSON.stringify({ u: userId, v: TOKEN_VERSION }), 'utf8')
  );
  const sig = sign(payloadB64, secret);
  return `${payloadB64}.${sig}`;
}

/**
 * Vérifie un token de désabonnement. Retourne le userId si la signature est
 * valide et le payload bien formé, sinon `null` (token absent, malformé,
 * altéré, ou version inconnue). Comparaison de signature à temps constant.
 */
export function verifyUnsubscribeToken(token: string): string | null {
  if (typeof token !== 'string' || token.length === 0) return null;
  const dot = token.indexOf('.');
  if (dot <= 0 || dot === token.length - 1) return null;

  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);

  const expectedSig = sign(payloadB64, getSecret());

  // Comparaison constante-temps. Les deux buffers doivent avoir la même
  // longueur, sinon timingSafeEqual throw → on retourne null.
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
    const parsed = JSON.parse(b64urlDecode(payloadB64).toString('utf8')) as {
      u?: unknown;
      v?: unknown;
    };
    if (parsed.v !== TOKEN_VERSION) return null;
    if (typeof parsed.u !== 'string' || parsed.u.length === 0) return null;
    return parsed.u;
  } catch {
    return null;
  }
}

/**
 * Génère un token de désabonnement signé pour une ADRESSE EMAIL (destinataire
 * sans compte auth). L'email est normalisé en minuscules avant signature —
 * `generateEmailUnsubscribeToken(' A@B.com ')` et `('a@b.com')` produisent le
 * même token. Auto-portant, pas d'expiry (comme la variante user).
 */
export function generateEmailUnsubscribeToken(email: string): string {
  const secret = getSecret();
  const normalized = email.trim().toLowerCase();
  const payloadB64 = b64url(
    Buffer.from(JSON.stringify({ e: normalized, v: TOKEN_VERSION }), 'utf8')
  );
  const sig = sign(payloadB64, secret);
  return `${payloadB64}.${sig}`;
}

/**
 * Vérifie un token de désabonnement EMAIL. Retourne l'email (minuscule) si la
 * signature est valide et le payload bien formé, sinon `null`. Comparaison de
 * signature à temps constant, identique à `verifyUnsubscribeToken`. Ne renvoie
 * JAMAIS un userId : le champ discriminant est `e` (un token user `{u,v}`
 * échoue ici, et réciproquement).
 */
export function verifyEmailUnsubscribeToken(token: string): string | null {
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
    const parsed = JSON.parse(b64urlDecode(payloadB64).toString('utf8')) as {
      e?: unknown;
      v?: unknown;
    };
    if (parsed.v !== TOKEN_VERSION) return null;
    if (typeof parsed.e !== 'string' || parsed.e.length === 0) return null;
    return parsed.e.toLowerCase();
  } catch {
    return null;
  }
}
