// pages/api/player/agenda.ics.ts
//
// Flux iCalendar PERSONNEL (lot J2 de docs/PLAN-espace-joueur.md).
//
// Pas de Bearer ici, et c'est délibéré : ce lien est collé dans Google ou Apple
// Calendar, qui le rappellent toutes les heures sans jamais pouvoir présenter
// une session. L'authentification est donc le JETON PORTEUR lui-même
// (`?token=`), émis et révocable depuis l'espace joueur — même contrat que le
// jeton de check-in.
//
// Conséquences assumées :
//   * `noindex` + `Cache-Control: private, no-store` : ce flux ne doit ni être
//     indexé ni finir dans un cache partagé ;
//   * jeton inconnu OU révoqué → 404 identique, sans dire lequel ;
//   * fenêtre large (−30 j → +180 j) : un agenda montre aussi ce qui vient de
//     se jouer, et se rafraîchit tout seul ensuite.

import type { NextApiRequest, NextApiResponse } from 'next';
import { applyRateLimit } from '@/utils/rateLimit';
import { resolveCalendarToken } from '@/utils/player/calendarToken';
import { buildAgendaIcs, loadPlayerAgenda } from '@/utils/player/agenda';
import { logger } from '@/utils/logger';

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.SITE_URL ||
  'https://owwomenscup.fr'
).replace(/\/$/, '');

const PAST_DAYS = 30;
const FUTURE_DAYS = 180;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Quota par IP : un client d'agenda poll, mais pas cent fois par minute.
  if (applyRateLimit(req, res, { max: 30, windowMs: 60_000 }, 'agenda-ics')) {
    return;
  }

  const raw = req.query.token;
  const token = Array.isArray(raw) ? raw[0] : raw;
  const resolved = token ? await resolveCalendarToken(token) : null;
  if (!resolved) {
    return res.status(404).json({ error: 'Not found' });
  }

  try {
    const now = Date.now();
    const agenda = await loadPlayerAgenda(resolved.userId, resolved.tenantId, {
      from: new Date(now - PAST_DAYS * 24 * 60 * 60_000),
      to: new Date(now + FUTURE_DAYS * 24 * 60 * 60_000),
    });

    const ics = buildAgendaIcs(agenda.entries, {
      calendarName: "Mes matchs — OW Women's Cup",
      siteUrl: SITE_URL,
    });

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'inline; filename="ow-womens-cup-agenda.ics"'
    );
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Robots-Tag', 'noindex');
    return res.status(200).send(ics);
  } catch (err) {
    logger.error('[player/agenda.ics] error:', err);
    return res.status(500).json({ error: 'Failed to build calendar' });
  }
}
