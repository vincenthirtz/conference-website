// pages/api/admin/tournament/[id]/checkin-nudge-all.ts
//
// « Relancer toutes les équipes non checkées » — lot A1 de
// docs/PLAN-espace-admin.md.
//
// Le centre de contrôle SAVAIT déjà dire « 3 équipes non checkées » ; il ne
// savait pas le corriger. Le geste existait pourtant, mais un match et un côté
// à la fois (`/api/admin/matches/[matchId]/checkin-nudge`) : un soir de journée
// à six matchs simultanés, c'était six écrans et douze clics.
//
// Cette route fait le tour des matchs imminents du tournoi et relance CHAQUE
// côté non checké, en réutilisant exactement la même mécanique (jeton généré si
// besoin, event `checkin.nudge` consommé par le bot).
//
// Idempotente au sens qui compte ici : relancer deux fois n'écrit rien de plus
// et ne crée pas de doublon d'état — au pire un capitaine reçoit deux DM, ce
// que le staff veut parfois précisément. Le garde-fou anti-double-clic est
// `withAdminIdempotency` (5 min), comme la version par match.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { withAdminIdempotency } from '@/utils/adminIdempotency';
import { isValidUUID } from '@/utils/apiHelpers';
import { emitBotEvent } from '@/utils/botEvents';
import { enrichMatchEvent } from '@/utils/matches/botEventEnrich';
import { buildCheckinUrl, generateCheckinToken } from '@/utils/checkin';

import { logger } from '../../../../../utils/logger';

/** Fenêtre de relance : les matchs des prochaines 24 h. */
const WINDOW_HOURS = 24;

export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'tournament-checkin-nudge-all' }),
  'admin'
);

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (!id || Array.isArray(id) || !isValidUUID(id)) {
    return res.status(400).json({ error: 'Invalid tournament ID' });
  }
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Database service unavailable' });
  }

  const tournamentId = String(id);
  const now = Date.now();
  const until = new Date(now + WINDOW_HOURS * 60 * 60_000).toISOString();

  try {
    const { data: rows, error } = await supabaseAdmin
      .from('matches')
      .select(
        'id, scheduled_at, status, team1_checked_in_at, team2_checked_in_at, team1_checkin_token, team2_checkin_token'
      )
      .eq('tenant_id', ctx.tenantId)
      .eq('tournament_id', tournamentId)
      .in('status', ['pending', 'ongoing'])
      .not('scheduled_at', 'is', null)
      .lte('scheduled_at', until)
      .order('scheduled_at', { ascending: true })
      .limit(50);

    if (error) {
      logger.error('[checkin-nudge-all] read error', error);
      return res.status(500).json({ error: 'Lecture des matchs impossible.' });
    }

    let nudged = 0;
    const touchedMatches: string[] = [];

    for (const raw of (rows ?? []) as Record<string, unknown>[]) {
      const matchId = raw.id as string;
      const sides: (1 | 2)[] = [];
      if (!raw.team1_checked_in_at) sides.push(1);
      if (!raw.team2_checked_in_at) sides.push(2);
      if (sides.length === 0) continue;

      // Jetons manquants : le cron ne les pose qu'à T-60, une relance manuelle
      // peut partir plus tôt. Backfill idempotent, comme la route par match.
      const updates: Record<string, string> = {};
      let token1 = (raw.team1_checkin_token as string | null) ?? null;
      let token2 = (raw.team2_checkin_token as string | null) ?? null;
      if (sides.includes(1) && !token1) {
        token1 = generateCheckinToken();
        updates.team1_checkin_token = token1;
      }
      if (sides.includes(2) && !token2) {
        token2 = generateCheckinToken();
        updates.team2_checkin_token = token2;
      }
      if (Object.keys(updates).length > 0) {
        const { error: tokErr } = await supabaseAdmin
          .from('matches')
          .update(updates)
          .eq('id', matchId)
          .eq('tenant_id', ctx.tenantId);
        if (tokErr) logger.error('[checkin-nudge-all] token error', tokErr);
      }

      const enriched = await enrichMatchEvent(matchId).catch(() => null);

      for (const side of sides) {
        const token = side === 1 ? token1 : token2;
        try {
          await emitBotEvent(
            'checkin.nudge',
            {
              matchId,
              tournamentId,
              teamSide: side,
              scheduledAt: (raw.scheduled_at as string | null) ?? null,
              nudgedByStaffId: ctx?.staff?.id ?? null,
              checkinUrl: token ? buildCheckinUrl(token) : null,
              enriched,
            },
            ctx.tenantId
          );
          nudged += 1;
        } catch (e) {
          // Une relance ratée n'annule pas les autres : le staff préfère cinq
          // équipes relancées sur six qu'un bouton qui échoue en bloc.
          logger.error(
            '[checkin-nudge-all] emit error match=%s side=%d',
            matchId,
            side,
            e
          );
        }
      }
      touchedMatches.push(matchId);
    }

    if (ctx?.staff?.id) {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'checkin_manual_nudge',
        entity_type: 'tournament',
        entity_id: tournamentId,
        tournament_id: tournamentId,
        payload: { scope: 'all_missing', nudged, matches: touchedMatches },
        tenant_id: ctx.tenantId,
      });
    }

    return res.status(200).json({
      success: true,
      nudged,
      matches: touchedMatches.length,
    });
  } catch (err) {
    logger.error('[checkin-nudge-all] error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
