// utils/captcha.ts
//
// CAPTCHA maison : un petit calcul, un défi gardé CÔTÉ SERVEUR.
//
// Parcours :
//   1. GET /api/captcha → { token, question }
//   2. la personne répond
//   3. le formulaire poste { captchaToken, captchaAnswer }
//   4. le serveur relit le défi en base, compte la tentative, et le consomme
//
// CE QUI A CHANGÉ LE 2026-09-16, ET POURQUOI (backlog Q037). Le jeton était un
// JSON base64url `{"answer":33,…,"hmac":…}` : la signature empêchait de le
// FORGER, pas de le LIRE. Un script qui décode le jeton répondait juste à tous
// les coups — le captcha ne filtrait donc que les robots qui ne le décodent
// pas. Et rien ne le rendait à usage unique : un défi résolu une fois servait
// à toutes les soumissions pendant cinq minutes.
//
// Désormais : la réponse ne quitte jamais le serveur (la table
// `captcha_challenges` en garde l'EMPREINTE), et une bonne réponse consomme le
// défi de façon atomique.
//
// LE HMAC RESTE, POUR UNE AUTRE RAISON. Il ne protège plus une réponse
// transportée : il atteste que le nonce présenté vient bien de nous, ce qui
// évite d'aller interroger la base sur des nonces tirés au hasard.
//
// CE QUE ÇA NE FAIT PAS. Un robot qui LIT la question sait toujours y répondre
// — un calcul en clair se résout, c'est la limite de l'exercice. Ce que ce
// module garantit, c'est qu'une réponse ne se réutilise pas, ne se devine pas
// en masse (trois tentatives par défi) et ne se lit pas dans le jeton. Le vrai
// plafond reste ailleurs : limites de débit par IP, honeypot, et vérification
// de l'adresse email là où elle existe.
//
// ÉCHEC FERMÉ. Sans base accessible, on ne délivre pas de défi et on n'en
// valide aucun : un formulaire public qui refuse vaut mieux qu'un captcha qui
// laisse tout passer.

import crypto from 'crypto';

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';

function resolveCaptchaSecret(): string {
  const explicit =
    process.env.CAPTCHA_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY;

  if (explicit) return explicit;

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'CAPTCHA_SECRET manquant en production : définissez la variable ' +
        "d'environnement CAPTCHA_SECRET (le CAPTCHA serait sinon contournable)."
    );
  }

  // Dev/test only: derive a non-public secret from the machine/runtime so the
  // value is never a hardcoded public constant. Captcha stays functional locally.
  console.warn(
    '[captcha] CAPTCHA_SECRET absent — secret de développement éphémère utilisé. ' +
      'Définissez CAPTCHA_SECRET pour un comportement stable.'
  );
  return crypto
    .createHash('sha256')
    .update(
      `captcha-dev:${process.env.HOSTNAME ?? ''}:${process.cwd()}:${process.pid}`
    )
    .digest('hex');
}

const CAPTCHA_SECRET = resolveCaptchaSecret();

/** Durée de vie d'un défi (5 minutes). */
const TOKEN_TTL_MS = 5 * 60 * 1000;

/**
 * Tentatives autorisées par défi.
 *
 * Une seule punirait une faute de frappe ; un nombre illimité laisserait
 * deviner la réponse, dont l'espace est petit. Trois borne le hasard sans
 * punir la maladresse.
 */
export const MAX_ATTEMPTS = 3;

type Operation = '+' | '-' | '×';

function randomInt(min: number, max: number): number {
  return crypto.randomInt(min, max + 1);
}

/** Empreinte de la réponse : la base ne porte jamais la solution en clair. */
function hashAnswer(nonce: string, answer: number | string): string {
  return crypto
    .createHmac('sha256', CAPTCHA_SECRET)
    .update(`${nonce}|${String(answer).trim()}`)
    .digest('hex');
}

/** Signature du nonce : atteste qu'il vient de nous, avant toute lecture en base. */
function signNonce(nonce: string): string {
  return crypto
    .createHmac('sha256', CAPTCHA_SECRET)
    .update(`captcha-nonce:${nonce}`)
    .digest('hex')
    .slice(0, 32);
}

function buildToken(nonce: string): string {
  return `${nonce}.${signNonce(nonce)}`;
}

/** Le nonce d'un jeton, si sa signature tient. `null` sinon. */
function readNonce(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [nonce, signature] = parts;
  if (!/^[a-f0-9]{16,64}$/.test(nonce)) return null;
  const expected = signNonce(nonce);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  return crypto.timingSafeEqual(a, b) ? nonce : null;
}

/* ---------------------------------------------------------------------------
 * Purge des défis échus
 * ------------------------------------------------------------------------- */

const PURGE_EVERY_MS = 60 * 60 * 1000;
let lastPurgeAt = 0;

/**
 * Supprime les défis largement échus, au fil de l'eau. Au plus une fois par
 * heure et par instance : c'est un entretien, pas un cron — et une purge ratée
 * ne doit jamais empêcher de délivrer un défi.
 */
async function purgeExpiredChallenges(nowMs: number): Promise<void> {
  if (!supabaseAdmin) return;
  if (nowMs - lastPurgeAt < PURGE_EVERY_MS) return;
  lastPurgeAt = nowMs;
  const cutoff = new Date(nowMs - PURGE_EVERY_MS).toISOString();
  const { error } = await supabaseAdmin
    .from('captcha_challenges')
    .delete()
    .lt('expires_at', cutoff);
  if (error) {
    logger.warn('[captcha] purge impossible: %s', error.message);
  }
}

/** Remet le compteur de purge à zéro (tests). */
export function __resetCaptchaPurgeForTests(): void {
  lastPurgeAt = 0;
}

/* ---------------------------------------------------------------------------
 * Émission
 * ------------------------------------------------------------------------- */

export type Challenge = { token: string; question: string };

/**
 * Un nouveau défi, enregistré côté serveur.
 *
 * `null` si le défi n'a pas pu être enregistré : l'appelant répond alors
 * « captcha indisponible » plutôt que de délivrer un jeton que personne ne
 * pourra valider.
 */
export async function generateChallenge(): Promise<Challenge | null> {
  const ops: Operation[] = ['+', '-', '×'];
  const op = ops[randomInt(0, ops.length - 1)];

  let a: number;
  let b: number;
  let answer: number;

  switch (op) {
    case '+':
      a = randomInt(10, 99);
      b = randomInt(10, 99);
      answer = a + b;
      break;
    case '-':
      a = randomInt(20, 99);
      b = randomInt(1, a); // jamais de résultat négatif
      answer = a - b;
      break;
    default:
      a = randomInt(3, 12);
      b = randomInt(3, 12);
      answer = a * b;
      break;
  }

  const question = `${a} ${op} ${b}`;
  const nonce = crypto.randomBytes(16).toString('hex');
  const nowMs = Date.now();

  if (!supabaseAdmin) {
    logger.error('[captcha] base indisponible : aucun défi délivré');
    return null;
  }

  const { error } = await supabaseAdmin.from('captcha_challenges').insert({
    nonce,
    answer_hash: hashAnswer(nonce, answer),
    expires_at: new Date(nowMs + TOKEN_TTL_MS).toISOString(),
    // Posé explicitement, alors que la colonne a un défaut : le compteur est
    // ce qui borne les essais, et le lire `undefined` le rendrait décoratif
    // (NaN >= 3 est faux — toute comparaison l'aurait laissé passer).
    attempts: 0,
  });
  if (error) {
    logger.error('[captcha] défi non enregistré: %s', error.message);
    return null;
  }

  // Entretien après coup : un défi délivré ne dépend jamais de la purge.
  await purgeExpiredChallenges(nowMs);

  return { token: buildToken(nonce), question };
}

/* ---------------------------------------------------------------------------
 * Vérification
 * ------------------------------------------------------------------------- */

export type CaptchaResult = { valid: boolean; error?: string };

type ChallengeRow = {
  nonce: string;
  answer_hash: string;
  expires_at: string;
  attempts: number;
  consumed_at: string | null;
};

/**
 * Le défi est-il résolu ?
 *
 * L'ORDRE COMPTE : on compte la tentative AVANT de comparer la réponse. Une
 * erreur qui ne coûterait rien rendrait le nombre de tentatives décoratif, et
 * c'est lui qui interdit de parcourir l'espace des réponses.
 */
export async function verifyCaptcha(
  token: string,
  userAnswer: string
): Promise<CaptchaResult> {
  if (!token || !userAnswer) {
    return { valid: false, error: 'Captcha manquant' };
  }

  const nonce = readNonce(token);
  if (!nonce) {
    return { valid: false, error: 'Token captcha invalide' };
  }

  if (!supabaseAdmin) {
    logger.error('[captcha] base indisponible : vérification refusée');
    return { valid: false, error: 'Captcha indisponible, réessayez' };
  }

  const { data, error } = await supabaseAdmin
    .from('captcha_challenges')
    .select('nonce, answer_hash, expires_at, attempts, consumed_at')
    .eq('nonce', nonce)
    .maybeSingle();
  if (error) {
    // Une lecture en échec n'est pas un défi absent : on refuse, on ne devine
    // pas.
    logger.error('[captcha] défi illisible: %s', error.message);
    return { valid: false, error: 'Captcha indisponible, réessayez' };
  }

  const challenge = data as ChallengeRow | null;
  if (!challenge || challenge.consumed_at) {
    // Déjà consommé ou inconnu (purgé) : même réponse, on n'apprend rien à un
    // robot sur ce que la base contient.
    return { valid: false, error: 'Captcha expiré, veuillez réessayer' };
  }

  if (Date.parse(challenge.expires_at) <= Date.now()) {
    return { valid: false, error: 'Captcha expiré, veuillez réessayer' };
  }

  // Coercition volontaire : une valeur absente ou illisible compte comme un
  // défi ÉPUISÉ, jamais comme « zéro tentative ».
  const attempts = Number.isFinite(Number(challenge.attempts))
    ? Number(challenge.attempts)
    : MAX_ATTEMPTS;
  if (attempts >= MAX_ATTEMPTS) {
    return { valid: false, error: 'Captcha expiré, veuillez réessayer' };
  }

  const { error: attemptError } = await supabaseAdmin
    .from('captcha_challenges')
    .update({ attempts: attempts + 1 })
    .eq('nonce', nonce);
  if (attemptError) {
    logger.error(
      '[captcha] tentative non comptée: %s — vérification refusée',
      attemptError.message
    );
    return { valid: false, error: 'Captcha indisponible, réessayez' };
  }

  const provided = hashAnswer(nonce, userAnswer);
  const expected = challenge.answer_hash;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { valid: false, error: 'Mauvaise réponse au captcha' };
  }

  // Bonne réponse : on CONSOMME, et seul le premier appel l'emporte. Deux
  // soumissions simultanées avec le même jeton ne peuvent pas réussir toutes
  // les deux.
  const { data: consumed, error: consumeError } = await supabaseAdmin
    .from('captcha_challenges')
    .update({ consumed_at: new Date().toISOString() })
    .eq('nonce', nonce)
    .is('consumed_at', null)
    .select('nonce');
  if (consumeError) {
    logger.error('[captcha] consommation impossible: %s', consumeError.message);
    return { valid: false, error: 'Captcha indisponible, réessayez' };
  }
  if (!consumed || consumed.length === 0) {
    return { valid: false, error: 'Captcha expiré, veuillez réessayer' };
  }

  return { valid: true };
}
