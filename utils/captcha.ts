import crypto from 'crypto';

/**
 * Server-side CAPTCHA using HMAC-signed math challenges.
 *
 * Flow:
 *  1. GET /api/captcha → returns { token, question }
 *  2. User answers the question
 *  3. POST /api/news/comments sends { captchaToken, captchaAnswer }
 *  4. Server verifies the HMAC signature and expiry
 *
 * No external service or dependency required.
 */

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

/** Token lifetime in milliseconds (5 minutes). */
const TOKEN_TTL_MS = 5 * 60 * 1000;

type Operation = '+' | '-' | '×';

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function generateChallenge(): { token: string; question: string } {
  const ops: Operation[] = ['+', '-', '×'];
  const op = ops[randomInt(0, ops.length - 1)];

  let a: number, b: number, answer: number;

  switch (op) {
    case '+':
      a = randomInt(1, 30);
      b = randomInt(1, 30);
      answer = a + b;
      break;
    case '-':
      a = randomInt(10, 40);
      b = randomInt(1, a); // ensure non-negative result
      answer = a - b;
      break;
    case '×':
      a = randomInt(2, 9);
      b = randomInt(2, 9);
      answer = a * b;
      break;
    default:
      a = 1;
      b = 1;
      answer = 2;
  }

  const question = `${a} ${op} ${b}`;
  const issuedAt = Date.now();
  const nonce = crypto.randomBytes(8).toString('hex');

  const payload = `${answer}|${issuedAt}|${nonce}`;
  const hmac = crypto
    .createHmac('sha256', CAPTCHA_SECRET)
    .update(payload)
    .digest('hex');

  const token = Buffer.from(
    JSON.stringify({ answer, issuedAt, nonce, hmac })
  ).toString('base64url');

  return { token, question };
}

export function verifyCaptcha(
  token: string,
  userAnswer: string
): { valid: boolean; error?: string } {
  if (!token || !userAnswer) {
    return { valid: false, error: 'Captcha manquant' };
  }

  let parsed: {
    answer: number;
    issuedAt: number;
    nonce?: string;
    hmac: string;
  };
  try {
    parsed = JSON.parse(Buffer.from(token, 'base64url').toString());
  } catch {
    return { valid: false, error: 'Token captcha invalide' };
  }

  const { answer, issuedAt, nonce, hmac } = parsed;

  const expectedHmac = crypto
    .createHmac('sha256', CAPTCHA_SECRET)
    .update(`${answer}|${issuedAt}|${nonce ?? ''}`)
    .digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expectedHmac))) {
    return { valid: false, error: 'Token captcha falsifié' };
  }

  // Check expiry
  if (Date.now() - issuedAt > TOKEN_TTL_MS) {
    return { valid: false, error: 'Captcha expiré, veuillez réessayer' };
  }

  // Check answer
  const parsed_answer = parseInt(userAnswer.toString().trim(), 10);
  if (Number.isNaN(parsed_answer) || parsed_answer !== answer) {
    return { valid: false, error: 'Mauvaise réponse au captcha' };
  }

  return { valid: true };
}
