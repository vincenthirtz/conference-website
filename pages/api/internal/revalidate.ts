// pages/api/internal/revalidate.ts — POST /api/internal/revalidate
//
// Régénération à la demande (ISR) déclenchée À DISTANCE par conference-api.
// Les handlers /api/* qui tournent là-bas ne peuvent pas régénérer les pages
// servies par Netlify avec leur propre `res.revalidate` : `utils/revalidate.ts`
// y POSTe `{ paths }` ici, avec l'en-tête `x-revalidate-secret`.
//
// CETTE ROUTE DOIT RESTER SERVIE PAR NETLIFY : `utils/edgeApiProxy.ts` exclut
// `/api/internal/` du relais, quoi que dise API_PROXY_PREFIXES.
//
// Appelle `res.revalidate` DIRECTEMENT (jamais `revalidatePaths`) : passer par
// le helper pourrait renvoyer la demande vers une autre instance, voire
// boucler.
//
// REVALIDATE_SECRET absent → 404 : la route n'existe pas.

import crypto from 'crypto';
import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { logger } from '@/utils/logger';
import {
  REVALIDATE_MAX_PATHS,
  REVALIDATE_SECRET_HEADER,
} from '@/utils/revalidate';

/**
 * Un chemin de page : commence par `/`, sans `//` (ni donc d'URL
 * protocol-relative), sans schéma, sans query/fragment, sans blanc ni
 * caractère de contrôle, sans antislash.
 */
const PagePath = z
  .string()
  .min(1)
  .max(512)
  .refine(
    (p) =>
      p.startsWith('/') &&
      !p.includes('//') &&
      !/^[a-z][a-z0-9+.-]*:/i.test(p) &&
      !/[\s\\?#\x00-\x1f\x7f]/.test(p),
    { message: 'invalid path' }
  );

const Body = z.object({
  paths: z.array(PagePath).min(1).max(REVALIDATE_MAX_PATHS),
});

function secretMatches(provided: unknown, expected: string): boolean {
  if (typeof provided !== 'string' || !provided) return false;
  // Empreintes de même longueur : timingSafeEqual ne fuit pas la longueur.
  const a = crypto.createHash('sha256').update(provided).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  res.setHeader('Cache-Control', 'no-store');
  const expected = (process.env.REVALIDATE_SECRET || '').trim();
  if (!expected) return res.status(404).json({ error: 'Not found' });

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!secretMatches(req.headers[REVALIDATE_SECRET_HEADER], expected)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = Body.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid body',
      code: 'invalid_body',
      details: parsed.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      })),
    });
  }

  const paths = [...new Set(parsed.data.paths)];
  const revalidated: string[] = [];
  const failed: string[] = [];
  await Promise.all(
    paths.map(async (path) => {
      try {
        await res.revalidate(path);
        revalidated.push(path);
      } catch (err) {
        failed.push(path);
        logger.error(`[internal/revalidate] ${path} failed`, err);
      }
    })
  );

  return res.status(200).json({ revalidated, failed });
}
