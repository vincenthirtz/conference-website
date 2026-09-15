import type { NextApiRequest, NextApiResponse } from 'next';
import { generateChallenge } from '@/utils/captcha';
import { applyRateLimit } from '@/utils/rateLimit';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ token: string; question: string } | { error: string }>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limiting: 30 challenges per minute
  if (applyRateLimit(req, res, { max: 30, windowMs: 60 * 1000 }, 'captcha'))
    return;

  // Le défi est enregistré côté serveur (`captcha_challenges`) : sans
  // enregistrement, pas de jeton — il ne serait validable par personne.
  const challenge = await generateChallenge();
  res.setHeader('Cache-Control', 'no-store');
  if (!challenge) {
    return res.status(503).json({ error: 'Captcha indisponible' });
  }

  return res.status(200).json(challenge);
}
