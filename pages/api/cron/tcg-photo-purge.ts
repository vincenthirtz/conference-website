// pages/api/cron/tcg-photo-purge.ts
//
// Fonction planifiée (Netlify, via netlify/functions/tcg-photo-purge-cron.ts)
// qui reprend les photos de carte dont la suppression a échoué au moment du
// retrait de consentement ou du refus de modération.
//
// POURQUOI UN CRON. Les deux chemins de retrait tentent déjà la suppression
// tout de suite. Mais `teams-images` est un bucket PUBLIC : une suppression
// qui échoue — réseau, 5xx du stockage — laissait, avant `tcg_photo_purges`,
// une photo joignable par son URL pour toujours, parce que la base ne portait
// plus le chemin. La file rend l'échec rattrapable ; ce balayage est ce qui le
// rattrape. Sans lui, la file ne ferait que consigner l'oubli.
//
// L'HEURE EST LA BONNE GRANULARITÉ. Le cas nominal est traité en direct par la
// route de retrait ; ce cron ne voit que des incidents. Le faire tourner à la
// minute ne ferait qu'interroger une table vide soixante fois plus souvent.
//
// RIEN N'EST JAMAIS ABANDONNÉ. Une ligne dont `attempts` grimpe n'est pas
// supprimée au bout de N essais : abandonner, ici, ce serait oublier une photo
// publique. Elle reste, et son compteur est le signal à regarder.
//
// Auth : `Authorization: Bearer <CRON_SECRET>` ou `?secret=<CRON_SECRET>`,
// comme les autres endpoints /api/cron/*, comparé en temps constant.

import crypto from 'node:crypto';
import type { NextApiRequest, NextApiResponse } from 'next';

import { logger } from '@/utils/logger';
import { sweepPhotoPurges } from '@/utils/tcg/photoPurge';

function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function isAuthorized(req: NextApiRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.error('[cron/tcg-photo-purge] CRON_SECRET absent — refus');
    return false;
  }
  const header = req.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    if (sameSecret(header.slice('Bearer '.length), secret)) return true;
  }
  const q = req.query.secret;
  return typeof q === 'string' && sameSecret(q, secret);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.setHeader('Allow', 'POST,GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const started = Date.now();
  // Sans filtre de tenant : un fichier oublié l'est dans le même bucket pour
  // tout le monde, et la file n'a pas à être balayée espace par espace.
  const result = await sweepPhotoPurges();
  const durationMs = Date.now() - started;

  // `failed` non nul veut dire qu'un fichier RÉSISTE. C'est un `warn`, pas un
  // `info` : la ligne restera en file et reviendra à chaque passage, mais elle
  // mérite d'être vue avant que son compteur atteigne la centaine.
  const log = result.failed > 0 ? logger.warn : logger.info;
  log(
    '[cron/tcg-photo-purge] examined=%d purged=%d failed=%d duration_ms=%d',
    result.examined,
    result.purged,
    result.failed,
    durationMs
  );

  return res.status(200).json({ ...result, duration_ms: durationMs });
}
