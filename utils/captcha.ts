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

const CAPTCHA_SECRET =
  process.env.CAPTCHA_SECRET ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY ||
  'fallback-captcha-secret-change-me';

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

  // Payload: answer|issuedAt
  const payload = `${answer}|${issuedAt}`;
  const hmac = crypto.createHmac('sha256', CAPTCHA_SECRET).update(payload).digest('hex');

  // Token encodes the payload + signature so verification is stateless
  const token = Buffer.from(JSON.stringify({ answer, issuedAt, hmac })).toString('base64url');

  return { token, question };
}

export function verifyCaptcha(token: string, userAnswer: string): { valid: boolean; error?: string } {
  if (!token || !userAnswer) {
    return { valid: false, error: 'Captcha manquant' };
  }

  let parsed: { answer: number; issuedAt: number; hmac: string };
  try {
    parsed = JSON.parse(Buffer.from(token, 'base64url').toString());
  } catch {
    return { valid: false, error: 'Token captcha invalide' };
  }

  const { answer, issuedAt, hmac } = parsed;

  // Verify HMAC
  const expectedHmac = crypto
    .createHmac('sha256', CAPTCHA_SECRET)
    .update(`${answer}|${issuedAt}`)
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
