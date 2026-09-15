// pages/api/cron/tcg-trades-expire.ts
//
// Fonction planifiée (Netlify, via netlify/functions/tcg-trades-expire-cron.ts)
// qui passe en `expired` les propositions d'échange TCG échues et annonce
// `tcg.trade_resolved` (outcome `expired`) à leurs proposantes.
//
// POURQUOI UN CRON EN PLUS DE L'EXPIRATION PARESSEUSE. Les routes d'échange
// expirent déjà ce qui concerne l'appelante avant de lire. Mais une proposition
// que la destinataire ignore, et dont la proposante ne rouvre pas la page,
// n'expirerait jamais « à temps » : le DM d'expiration arriverait des jours plus
// tard, au prochain passage de l'une des deux. L'heure est la bonne granularité
// pour une échéance de 72 h.
//
// UNE SEULE ANNONCE PAR PROPOSITION, quels que soient les déclencheurs :
// l'écriture est conditionnelle (`status = 'pending'`) et seules les lignes
// qu'elle a fait basculer sont annoncées (cf. `expireOverdueTrades`).
//
// Auth : `Authorization: Bearer <CRON_SECRET>` ou `?secret=<CRON_SECRET>`,
// comme les autres endpoints /api/cron/*, comparé en temps constant.

import crypto from 'node:crypto';
import type { NextApiRequest, NextApiResponse } from 'next';

import { logger } from '@/utils/logger';
import { expireOverdueTrades } from '@/utils/tcg/trades';

function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function isAuthorized(req: NextApiRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.error('[cron/tcg-trades-expire] CRON_SECRET absent — refus');
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
  // Sans filtre de tenant : le balayage couvre tous les espaces, et
  // `expireOverdueTrades` annonce chaque expiration dans l'outbox de SON espace.
  const expired = await expireOverdueTrades({});
  const durationMs = Date.now() - started;
  logger.info(
    '[cron/tcg-trades-expire] expired=%d duration_ms=%d',
    expired,
    durationMs
  );
  return res.status(200).json({ expired, duration_ms: durationMs });
}
