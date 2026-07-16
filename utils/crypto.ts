// utils/crypto.ts
//
// Chiffrement symétrique authentifié (AES-256-GCM) pour secrets au repos —
// aujourd'hui les tokens OAuth broadcaster Twitch (access + refresh) stockés
// dans twitch_broadcaster_connections. Ces tokens pilotent la chaîne
// (predictions, modération, points, chat) : ils ne doivent JAMAIS être en clair
// en base. On chiffre côté API (supabaseAdmin) avant insert, on déchiffre juste
// avant d'appeler Helix.
//
// Format de sortie : `v1.<iv>.<tag>.<ciphertext>` (chaque segment en base64url).
// GCM fournit l'authentification (toute altération → échec au déchiffrement).
//
// Clé : dérivée par scrypt d'un secret d'environnement TWITCH_TOKEN_ENC_KEY
// (n'importe quelle longueur acceptée — on dérive 32 octets). Rotation = changer
// l'env invalide les valeurs existantes (il faudra reconnecter la chaîne) ; le
// versionnage `v1.` permet une migration future si besoin.

import crypto from 'crypto';

const ALGO = 'aes-256-gcm';
// Sel statique de dérivation de clé. Documenté et fixe : la sécurité repose sur
// le secret d'env, pas sur le sel (scrypt en a besoin d'un déterministe pour
// re-dériver la même clé au déchiffrement).
const KEY_SALT = 'twitch-broadcaster-token-v1';

function getKey(): Buffer {
  const secret = process.env.TWITCH_TOKEN_ENC_KEY?.trim();
  if (!secret) {
    throw new Error('TWITCH_TOKEN_ENC_KEY is not set (token encryption key).');
  }
  // Dérive une clé 32 octets déterministe depuis le secret d'env.
  return crypto.scryptSync(secret, KEY_SALT, 32);
}

/** True si la clé de chiffrement est configurée (feature dormante sinon). */
export function isSecretEncryptionConfigured(): boolean {
  return !!process.env.TWITCH_TOKEN_ENC_KEY?.trim();
}

/** Chiffre `plaintext` → `v1.<iv>.<tag>.<ct>` (base64url). Throw si clé absente. */
export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12); // 96 bits, recommandé pour GCM
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    'v1',
    iv.toString('base64url'),
    tag.toString('base64url'),
    ct.toString('base64url'),
  ].join('.');
}

/**
 * Déchiffre une valeur produite par encryptSecret. Throw sur format invalide,
 * clé absente, ou altération (tag GCM invalide).
 */
export function decryptSecret(payload: string): string {
  const parts = payload.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error('decryptSecret: format de payload invalide.');
  }
  const key = getKey();
  const iv = Buffer.from(parts[1]!, 'base64url');
  const tag = Buffer.from(parts[2]!, 'base64url');
  const ct = Buffer.from(parts[3]!, 'base64url');
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString(
    'utf8'
  );
}
