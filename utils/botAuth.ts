// utils/botAuth.ts
// Verification de l'API key partagee bot <-> site (BOT_API_KEY).
// Helper extrait pour les nouveaux endpoints ; les endpoints existants gardent
// leur copie locale tant qu'ils n'ont pas besoin d'etre touches.

import crypto from 'crypto';
import type { NextApiRequest } from 'next';

export function verifyBotApiKey(req: NextApiRequest): boolean {
  const expected = process.env.BOT_API_KEY;
  if (!expected) return false;
  const provided = req.headers['x-api-key'];
  if (typeof provided !== 'string' || provided.length === 0) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
