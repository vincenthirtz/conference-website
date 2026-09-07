// utils/social/oauthState.ts
//
// Le paramètre `state` d'un aller-retour OAuth, signé.
//
// IL PORTE DEUX CHOSES À LA FOIS, et c'est pour ça qu'il ne peut pas être un
// simple nonce aléatoire :
//   - la protection CSRF — on ne termine que le parcours qu'ON a ouvert ;
//   - le tenant, qu'on retrouve au retour sans avoir à le stocker quelque part
//     entre les deux requêtes.
//
// SIGNÉ, PAS CHIFFRÉ. Le contenu n'a rien de secret (un identifiant de tenant,
// un nonce, une date) ; ce qu'on veut, c'est qu'il ne soit pas FABRICABLE. HMAC
// SHA-256, comparaison à temps constant, TTL 10 minutes.
//
// UN SEL PAR FOURNISSEUR. Sans lui, un `state` émis pour Instagram serait
// accepté au callback TikTok : même clé, même format, signature valide. Le sel
// enferme chaque jeton dans son parcours.
//
// Extrait de `./instagram.ts`, qui portait ce mécanisme seul. TikTok en a
// besoin à l'identique — et deux copies d'un contrôle CSRF, c'est une copie de
// trop le jour où l'une des deux est corrigée.

import crypto from 'crypto';

const STATE_TTL_MS = 10 * 60 * 1000;

export type StatePayload = { tenantId: string; nonce: string; iat: number };

function stateKey(salt: string): Buffer {
  const secret =
    process.env.SECRETS_ENC_KEY?.trim() ||
    process.env.TWITCH_TOKEN_ENC_KEY?.trim() ||
    '';
  if (!secret) throw new Error('SECRETS_ENC_KEY absente.');
  return crypto.scryptSync(secret, salt, 32);
}

export function signOauthState(salt: string, tenantId: string): string {
  const payload: StatePayload = {
    tenantId,
    nonce: crypto.randomBytes(12).toString('base64url'),
    iat: Date.now(),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto
    .createHmac('sha256', stateKey(salt))
    .update(body)
    .digest('base64url');
  return `${body}.${mac}`;
}

/** Vérifie signature ET fraîcheur. Renvoie null sur tout doute. */
export function verifyOauthState(
  salt: string,
  state: string
): StatePayload | null {
  const [body, mac] = (state || '').split('.');
  if (!body || !mac) return null;

  const expected = crypto
    .createHmac('sha256', stateKey(salt))
    .update(body)
    .digest('base64url');

  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(body, 'base64url').toString('utf8')
    ) as StatePayload;
    if (Date.now() - payload.iat > STATE_TTL_MS) return null;
    return payload;
  } catch {
    return null;
  }
}
