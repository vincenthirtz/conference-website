// pages/api/admin/tournament/[id]/schedule-diagnostics.ts
//
// « Qu'est-ce qui cloche dans ce calendrier ? » — lot 3 de
// docs/PLAN-plateforme-tournois.md.
//
// GET → `{ tournament, counts, anomalies, slotGrid, teams }`
//
// Superset de `conflicts.ts`, qui ne voit que le chevauchement d'équipe. Ici on
// confronte aussi le calendrier aux contraintes de disponibilité (lot 1), aux
// dates annoncées du tournoi et à la capacité de la production — et on propose
// la correction quand elle est triviale.
//
// Paramètres, tous optionnels :
//   ?rest=<minutes>          repos exigé entre deux matchs d'une équipe (défaut 30)
//   ?concurrent=<n>          matchs simultanés que la production porte (défaut 1)
//   ?tz=<IANA>               fuseau de lecture (défaut : celui du tournoi)
//
// Lecture seule, aucun effet de bord : cette route ne déplace jamais un match.
// La correction proposée est un objet dans la réponse, pas une écriture.

import type { NextApiRequest, NextApiResponse } from 'next';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { logger } from '@/utils/logger';
import { isValidUUID } from '@/utils/apiHelpers';
import { loadScheduleContext } from '@/utils/matches/scheduleContext';
import { diagnoseSchedule } from '@/utils/matches/scheduleDiagnostics';

function readInt(
  req: NextApiRequest,
  key: string,
  fallback: number,
  min: number,
  max: number
): number {
  const raw = req.query[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return fallback;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < min || n > max) return fallback;
  return n;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const raw = req.query.id;
  const tournamentId = Array.isArray(raw) ? raw[0] : raw;
  if (!tournamentId || !isValidUUID(tournamentId)) {
    return res
      .status(400)
      .json({ error: 'Invalid tournament id', code: 'INVALID_TOURNAMENT_ID' });
  }

  try {
    const context = await loadScheduleContext(ctx.tenantId, tournamentId);
    if (!context) {
      return res
        .status(404)
        .json({ error: 'Tournament not found', code: 'TOURNAMENT_NOT_FOUND' });
    }

    const tzParam = req.query.tz;
    const timezone =
      (typeof tzParam === 'string' && tzParam) || context.tournament.timezone;

    const diagnosis = diagnoseSchedule(context.matches, context.constraints, {
      timezone,
      tournamentStart: context.tournament.startDate,
      tournamentEnd: context.tournament.endDate,
      // 30 min de repos, 1 match à la fois : les valeurs de la Cup. Réglables,
      // parce qu'un tournoi en LAN sur quatre stations n'a pas les mêmes.
      teamRestMinutes: readInt(req, 'rest', 30, 0, 240),
      maxConcurrentMatches: readInt(req, 'concurrent', 1, 1, 32),
    });

    return res.status(200).json({
      tournament: { ...context.tournament, timezone },
      counts: diagnosis.counts,
      anomalies: diagnosis.anomalies,
      slotGrid: diagnosis.slotGrid,
      teamNames: context.teamNames,
      constraintCount: context.constraints.length,
      matchCount: context.matches.length,
    });
  } catch (err) {
    logger.error('[admin/schedule-diagnostics] error', err, { tournamentId });
    return res.status(500).json({ error: 'Server error.' });
  }
}

export default withStaffRoute(handler, { permission: 'manage_tournaments' });
