// pages/api/admin/matches/[matchId]/checkin-nudge.ts
//
// Lot 5 — Live Check-In Console.
// POST avec body { teamSide: 1 | 2 | 'both' } : émet un event outbox
// `checkin.nudge` que le bot Discord consomme pour DM le(s) capitaine(s)
// de l'équipe avec un nouveau lien de check-in.
//
// Idempotence "soft" via `withAdminIdempotency` (5 min) — un double-click
// admin n'envoie qu'un seul DM. Au-delà, un re-clic réémet (volontairement
// permis : staff peut vouloir spammer un capitaine peu réactif).

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

type TeamSide = 1 | 2 | 'both';

export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'match-checkin-nudge' }),
  { permission: 'run_checkin' }
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

  const { matchId } = req.query;
  if (!matchId || Array.isArray(matchId) || !isValidUUID(matchId)) {
    return res.status(400).json({ error: 'Invalid matchId' });
  }
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Database service unavailable' });
  }

  const id = String(matchId);
  const body = (req.body ?? {}) as { teamSide?: unknown };
  const sideRaw = body.teamSide;
  let teamSide: TeamSide;
  if (sideRaw === 1 || sideRaw === 2 || sideRaw === 'both') {
    teamSide = sideRaw;
  } else {
    return res.status(400).json({ error: 'teamSide must be 1, 2 or "both"' });
  }

  try {
    const { data: match } = await supabaseAdmin
      .from('matches')
      .select(
        'id, tournament_id, status, team1_id, team2_id, team1_checked_in_at, team2_checked_in_at, team1_checkin_token, team2_checkin_token, scheduled_at'
      )
      .eq('id', id)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle();

    if (!match) {
      return res.status(404).json({ error: 'Match not found' });
    }

    if (match.status !== 'pending' && match.status !== 'ongoing') {
      return res.status(409).json({
        error: `Cannot nudge a match in status '${match.status}'. Must be 'pending' or 'ongoing'.`,
        code: 'INVALID_STATUS',
      });
    }

    // Construire la liste effective de sides à nudger en respectant l'état
    // de check-in : si une team a déjà coché, on ne la nudge pas même si
    // l'admin a demandé 'both'.
    const requested: (1 | 2)[] = teamSide === 'both' ? [1, 2] : [teamSide];
    const sidesToNudge: (1 | 2)[] = requested.filter((s) => {
      const checked =
        s === 1 ? match.team1_checked_in_at : match.team2_checked_in_at;
      return !checked;
    });

    if (sidesToNudge.length === 0) {
      return res.status(409).json({
        error: 'Aucune équipe à relancer (déjà check-in).',
        code: 'ALREADY_CHECKED_IN',
      });
    }

    // Ensure check-in tokens exist for every side we need. The cron also
    // generates them at T-60 but a manual nudge may fire earlier, so we
    // backfill here if missing (idempotent NOT NULL update).
    let team1Token: string | null = (match as any).team1_checkin_token ?? null;
    let team2Token: string | null = (match as any).team2_checkin_token ?? null;
    const tokenUpdates: Record<string, string> = {};
    if (sidesToNudge.includes(1) && !team1Token) {
      team1Token = generateCheckinToken();
      tokenUpdates.team1_checkin_token = team1Token;
    }
    if (sidesToNudge.includes(2) && !team2Token) {
      team2Token = generateCheckinToken();
      tokenUpdates.team2_checkin_token = team2Token;
    }
    if (Object.keys(tokenUpdates).length > 0) {
      const { error: tokErr } = await supabaseAdmin
        .from('matches')
        .update(tokenUpdates)
        .eq('id', id)
        .eq('tenant_id', ctx.tenantId);
      if (tokErr) {
        logger.error('[checkin-nudge] token backfill error', tokErr);
      }
    }

    const enriched = await enrichMatchEvent(id).catch(() => null);

    // Emit one event per nudged side so the bot can route to the right
    // captain independently — keeps the dispatcher simple and the
    // payload narrow.
    const emitted: number[] = [];
    for (const side of sidesToNudge) {
      const token = side === 1 ? team1Token : team2Token;
      const checkinUrl = token ? buildCheckinUrl(token) : null;
      try {
        await emitBotEvent(
          'checkin.nudge',
          {
            matchId: id,
            tournamentId: match.tournament_id ?? null,
            teamSide: side,
            scheduledAt: match.scheduled_at ?? null,
            nudgedByStaffId: ctx?.staff?.id ?? null,
            checkinUrl,
            enriched,
          },
          ctx.tenantId
        );
        emitted.push(side);
      } catch (e) {
        logger.error(
          '[checkin-nudge] emitBotEvent error matchId=%s side=%d',
          id,
          side,
          e
        );
      }
    }

    if (emitted.length === 0) {
      return res.status(500).json({ error: 'Failed to emit any nudge event' });
    }

    if (ctx?.staff?.id) {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'checkin_manual_nudge',
        entity_type: 'match',
        entity_id: id,
        tournament_id: match.tournament_id ?? null,
        payload: { team_sides: emitted },
        tenant_id: ctx.tenantId,
        permission: ctx.permission,
      });
    }

    return res.status(200).json({
      success: true,
      matchId: id,
      nudgedSides: emitted,
      skippedSides: requested.filter((s) => !emitted.includes(s)),
    });
  } catch (err) {
    logger.error('[/api/admin/matches/[matchId]/checkin-nudge] error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
