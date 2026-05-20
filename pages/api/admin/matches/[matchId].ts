// pages/api/admin/matches/[matchId].ts
// Route admin pour gérer un match :
// - GET : détail du match (+ équipes, + games optionnelles)
// - PUT/PATCH : update score (avec propagation) OU méta-données
// - DELETE : annuler ou supprimer un match

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { applyMatchScore } from '@/utils/matches/applyScore';
import { logStaffAction } from '@/utils/staffLogs';
// TODO(S5b): remplacer par le tenantId resolu depuis la staff session
// (`ctx.tenantId`) une fois la middleware staff multi-tenant deployee.
import { DEFAULT_TENANT_ID } from '@/utils/tenant';
import { isValidUUID } from '@/utils/apiHelpers';
import { notifyMatchStarting } from '@/utils/discord';
import { emitBotEvent } from '@/utils/botEvents';
import { enrichMatchEvent } from '@/utils/matches/botEventEnrich';

import { logger } from '../../../../utils/logger';
export default withStaffRoute(handler, 'manager'); // rôle min : manager

async function handler(req: NextApiRequest, res: NextApiResponse, ctx: AuthenticatedStaffContext) {
  const { matchId } = req.query;

  if (!matchId || Array.isArray(matchId) || !isValidUUID(matchId)) {
    return res.status(400).json({ error: 'Invalid matchId' });
  }

  try {
    switch (req.method) {
      case 'GET':
        return await handleGet(matchId, req, res);
      case 'PUT':
      case 'PATCH':
        return await handlePut(matchId, req, res, ctx);
      case 'DELETE':
        return await handleDelete(matchId, req, res, ctx);
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err: unknown) {
    logger.error('[/api/admin/matches/[matchId]] error:', err);
    return res.status(500).json({
      error: 'Internal server error',
    });
  }
}

/* -----------------------------------------------------------
 * GET : détail du match (+ option includeGames=1)
 * ---------------------------------------------------------*/

async function handleGet(
  matchId: string,
  req: NextApiRequest,
  res: NextApiResponse
) {
  const includeGames =
    req.query.includeGames === '1' || req.query.includeGames === 'true';

  const baseSelect = `
    id,
    tournament_id,
    stage_id,
    status,
    is_bye,
    match_format,
    round_name,
    round_number,
    bracket_side,
    group_key,
    team1_id,
    team2_id,
    team1_score,
    team2_score,
    winner_team_id,
    forfeit_team_id,
    scheduled_at,
    completed_at,
    updated_at,
    stream_url,
    replay_url,
    lobby_code,
    notes,
    next_match_win_id,
    next_match_win_slot,
    next_match_lose_id,
    next_match_lose_slot,
    dispute_reason,
    dispute_opened_by,
    dispute_opened_at,
    dispute_resolution,
    dispute_resolved_by,
    dispute_resolved_at,
    team1:team1_id(id, name, short_name, logo_url),
    team2:team2_id(id, name, short_name, logo_url),
    stage:stage_id(id, name, stage_type, is_active),
    tournament:tournament_id(id, name, slug, status)
  `;

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase admin not configured' });
  }

  const select = includeGames ? `${baseSelect}, games:games(*)` : baseSelect;

  const { data, error } = await supabaseAdmin
    .from('matches')
    .select(select)
    .eq('id', matchId)
    .maybeSingle();

  if (error || !data) {
    logger.error('admin GET match error:', error);
    return res.status(404).json({ error: 'Match not found' });
  }

  return res.status(200).json({ match: data });
}

/* -----------------------------------------------------------
 * PUT / PATCH :
 *  - mode "score" : appliquer un score + propagation
 *  - mode "meta"  : mise à jour des champs méta (planning, liens bracket, etc.)
 * Body :
 *  { mode: "score", team1Score, team2Score, winnerTeamId?, status?, propagate? }
 *  ou
 *  { mode: "meta", ...champs à mettre à jour... }
 * ---------------------------------------------------------*/

async function handlePut(
  matchId: string,
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const { mode } = req.body as { mode?: 'score' | 'meta' };

  // --- Optimistic locking ---
  // Si le client envoie expected_updated_at, on vérifie que le match n'a pas
  // été modifié entre-temps. Cela protège contre les mises à jour concurrentes.
  const { expected_updated_at } = req.body as { expected_updated_at?: string };

  if (expected_updated_at) {
    const { data: current } = await supabaseAdmin
      .from('matches')
      .select('updated_at')
      .eq('id', matchId)
      .maybeSingle();

    if (current && current.updated_at !== expected_updated_at) {
      return res.status(409).json({
        error:
          'Ce match a été modifié par un autre utilisateur. Rechargez la page et réessayez.',
        code: 'CONFLICT',
        server_updated_at: current.updated_at,
      });
    }
  }

  // --- Guard: reject score/meta changes if tournament is completed ---
  {
    const { data: matchForGuard } = await supabaseAdmin
      .from('matches')
      .select('tournament_id')
      .eq('id', matchId)
      .maybeSingle();

    if (matchForGuard?.tournament_id) {
      const { data: tournament } = await supabaseAdmin
        .from('tournaments')
        .select('status')
        .eq('id', matchForGuard.tournament_id)
        .maybeSingle();

      if (tournament?.status === 'completed') {
        return res.status(403).json({
          error:
            'Impossible de modifier ce match : le tournoi est terminé (status=completed). Réouvrez le tournoi pour effectuer des modifications.',
          code: 'TOURNAMENT_COMPLETED',
        });
      }
    }
  }

  if (
    mode === 'score' ||
    hasScorePayload(req.body) ||
    req.body.forfeit_team_id
  ) {
    // --- Update score (avec helper applyMatchScore) ---
    const {
      team1Score,
      team2Score,
      winnerTeamId,
      status,
      propagate = true,
      forfeit_team_id,
    } = req.body;

    // Scores obligatoires sauf en mode forfait (auto-calculés par applyMatchScore)
    if (!forfeit_team_id) {
      if (typeof team1Score !== 'number' || typeof team2Score !== 'number') {
        return res.status(400).json({
          error: 'Missing numeric team1Score / team2Score',
        });
      }

      if (
        !Number.isInteger(team1Score) ||
        !Number.isInteger(team2Score) ||
        team1Score < 0 ||
        team2Score < 0
      ) {
        return res.status(400).json({
          error: 'Scores must be integers >= 0',
        });
      }
    }

    const VALID_MATCH_STATUSES = [
      'pending',
      'ongoing',
      'finished',
      'cancelled',
      'postponed',
      'walkover',
    ];
    if (status !== undefined && !VALID_MATCH_STATUSES.includes(status)) {
      // Le passage en 'disputed' DOIT passer par /api/admin/matches/[matchId]/dispute
      // pour garantir la saisie d'une raison + de l'auteur. On rejette ici.
      if (status === 'disputed') {
        return res.status(400).json({
          error:
            'Use POST /api/admin/matches/[matchId]/dispute to open a dispute.',
          code: 'USE_DISPUTE_ENDPOINT',
        });
      }
      return res.status(400).json({
        error: `Invalid status. Allowed values: ${VALID_MATCH_STATUSES.join(', ')}`,
      });
    }

    const result = await applyMatchScore({
      // TODO(S5b): remplacer par ctx.tenantId une fois la staff session
      // multi-tenant en place.
      tenantId: DEFAULT_TENANT_ID,
      matchId,
      team1Score,
      team2Score,
      winnerTeamId: typeof winnerTeamId === 'string' ? winnerTeamId : undefined,
      forfeitTeamId:
        typeof forfeit_team_id === 'string' ? forfeit_team_id : undefined,
      status,
      markFinished: status === 'finished' || (!status && !forfeit_team_id),
      staffId: ctx.staff?.id ?? null,
      propagateBracket: propagate !== false,
    });

    return res.status(200).json(result);
  }

  // --- Update méta-données du match ---
  const metaFieldsWhitelist: string[] = [
    'tournament_id',
    'stage_id',
    'status',
    'is_bye',
    'match_format',
    'round_name',
    'round_number',
    'bracket_side',
    'group_key',
    'team1_id',
    'team2_id',
    'scheduled_at',
    'completed_at',
    'stream_url',
    'replay_url',
    'lobby_code',
    'notes',
    'next_match_win_id',
    'next_match_win_slot',
    'next_match_lose_id',
    'next_match_lose_slot',
  ];

  const updatePayload: Record<string, any> = {};

  for (const key of metaFieldsWhitelist) {
    if (key in req.body) {
      updatePayload[key] = (req.body as any)[key];
    }
  }

  if (Object.keys(updatePayload).length === 0) {
    return res.status(400).json({
      error:
        "No valid meta fields in body. Use mode='score' for score updates.",
    });
  }

  // Toujours mettre à jour updated_at pour l'optimistic locking
  updatePayload.updated_at = new Date().toISOString();

  // Validation des champs meta
  const VALID_MATCH_STATUSES_META = [
    'pending',
    'ongoing',
    'finished',
    'cancelled',
    'postponed',
    'walkover',
  ];
  if ('status' in updatePayload) {
    if (updatePayload.status === 'disputed') {
      return res.status(400).json({
        error:
          'Use POST /api/admin/matches/[matchId]/dispute to open a dispute.',
        code: 'USE_DISPUTE_ENDPOINT',
      });
    }
    if (!VALID_MATCH_STATUSES_META.includes(updatePayload.status)) {
      return res.status(400).json({
        error: `Invalid status. Allowed values: ${VALID_MATCH_STATUSES_META.join(', ')}`,
      });
    }
  }

  // En mode meta : si le match est en dispute, on n'autorise pas non plus
  // les mises a jour de score/winner via le whitelist. Sortir de dispute passe
  // forcement par l'endpoint /dispute.
  // (le whitelist meta n'inclut pas team1_score / team2_score / winner_team_id,
  // donc en pratique ce sont surtout planning/notes/lobby qui sont permis ici.
  // On permet ces mises a jour meme en dispute pour que le staff puisse
  // continuer a planifier / annoter pendant qu'une dispute est ouverte.)

  const VALID_BRACKET_SIDES = ['wb', 'lb', 'final', 'none'];
  if (
    'bracket_side' in updatePayload &&
    updatePayload.bracket_side !== null &&
    !VALID_BRACKET_SIDES.includes(updatePayload.bracket_side)
  ) {
    return res.status(400).json({
      error: `Invalid bracket_side. Allowed values: ${VALID_BRACKET_SIDES.join(', ')}`,
    });
  }

  if (
    'next_match_win_slot' in updatePayload &&
    updatePayload.next_match_win_slot !== null &&
    ![1, 2].includes(updatePayload.next_match_win_slot)
  ) {
    return res
      .status(400)
      .json({ error: 'next_match_win_slot must be 1 or 2' });
  }

  if (
    'next_match_lose_slot' in updatePayload &&
    updatePayload.next_match_lose_slot !== null &&
    ![1, 2].includes(updatePayload.next_match_lose_slot)
  ) {
    return res
      .status(400)
      .json({ error: 'next_match_lose_slot must be 1 or 2' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase admin not configured' });
  }

  const { data: before, error: fetchErr } = await supabaseAdmin
    .from('matches')
    .select('*')
    .eq('id', matchId)
    .maybeSingle();

  if (fetchErr || !before) {
    return res.status(404).json({ error: 'Match not found' });
  }

  // --- Warning: scheduled_at outside tournament date range ---
  const warnings: string[] = [];
  const scheduledAtValue =
    'scheduled_at' in updatePayload
      ? updatePayload.scheduled_at
      : before.scheduled_at;

  if (scheduledAtValue && before.tournament_id) {
    const { data: tournament } = await supabaseAdmin
      .from('tournaments')
      .select('start_date, end_date')
      .eq('id', before.tournament_id)
      .maybeSingle();

    if (tournament) {
      const scheduledTime = new Date(scheduledAtValue).getTime();
      if (
        tournament.start_date &&
        scheduledTime < new Date(tournament.start_date).getTime()
      ) {
        warnings.push(
          `Le match est planifié avant le début du tournoi (${tournament.start_date})`
        );
      }
      if (
        tournament.end_date &&
        scheduledTime > new Date(tournament.end_date).getTime()
      ) {
        warnings.push(
          `Le match est planifié après la fin du tournoi (${tournament.end_date})`
        );
      }
    }
  }

  // Garde "match engagé" : changer le match_format d'un match qui a quitté
  // pending peut casser l'historique (BO3 finished re-passé en BO5 par ex).
  // On refuse strictement — pour corriger un format erroné après coup, il
  // faut reset le match en pending d'abord.
  if (
    'match_format' in updatePayload &&
    updatePayload.match_format !== before.match_format &&
    before.status !== 'pending' &&
    before.status !== 'cancelled'
  ) {
    return res.status(409).json({
      error:
        `Impossible de modifier le format d'un match dont le statut est "${before.status}". Repassez le match en pending (ou annulez-le) d'abord.`,
      code: 'MATCH_FORMAT_LOCKED',
      currentStatus: before.status,
    });
  }

  // Auto-lock du veto au passage en 'ongoing' : empeche un caster de modifier
  // les bans/picks une fois la game commencee. Reset possible par un admin
  // via PATCH /api/admin/matches/[matchId]/veto { unlock: true }.
  if (
    'status' in updatePayload &&
    updatePayload.status === 'ongoing' &&
    before.status !== 'ongoing' &&
    !before.veto_locked_at
  ) {
    updatePayload.veto_locked_at = new Date().toISOString();
  }

  const { data: updated, error: updErr } = await supabaseAdmin
    .from('matches')
    .update(updatePayload)
    .eq('id', matchId)
    .select('*')
    .maybeSingle();

  if (updErr || !updated) {
    logger.error('admin PUT match meta error:', updErr);
    return res.status(500).json({
      error: 'Failed to update match metadata',
    });
  }

  if (ctx?.staff?.id) {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'update_match',
      entity_type: 'match',
      entity_id: matchId,
      tournament_id: updated.tournament_id ?? null,
      payload: {
        mode: 'meta',
        before,
        after: updated,
        ...(warnings.length > 0 ? { warnings } : {}),
      },
    });
  }

  // Discord notification: match passed to "ongoing" -> ping teams
  if (
    'status' in updatePayload &&
    updatePayload.status === 'ongoing' &&
    before.status !== 'ongoing'
  ) {
    void notifyMatchStartingForMatch(matchId).catch((e) =>
      logger.error('[discord] notifyMatchStarting error:', e)
    );
    // Enrich payload pour que le bot cree direct le thread #matchs-live
    // avec embed (noms d'equipes, logos, avatar capitaine en thumbnail)
    // sans round-trip supplementaire vers /api/bot/v1/matches/[id].
    void (async () => {
      const enriched = await enrichMatchEvent(matchId);
      await emitBotEvent('match.starting', {
        matchId,
        tournamentId: updated.tournament_id ?? null,
        scrimId: updated.scrim_id ?? null,
        team1Id: updated.team1_id ?? null,
        team2Id: updated.team2_id ?? null,
        scheduledAt: updated.scheduled_at ?? null,
        startedAt: updated.started_at ?? null,
        matchFormat: updated.match_format ?? null,
        lobbyCode: updated.lobby_code ?? null,
        streamUrl: updated.stream_url ?? null,
        enriched,
      });
    })().catch((e) =>
      logger.error('[botEvents] match.starting emit error:', e)
    );
  }

  // Scheduled event Discord natif : on emit match.scheduled/unscheduled quand
  // scheduled_at change. Le bot creera/mettra a jour/supprimera l'event natif.
  if ('scheduled_at' in updatePayload) {
    const prev = before.scheduled_at ?? null;
    const next = updated.scheduled_at ?? null;
    if (prev !== next) {
      if (next) {
        void (async () => {
          const enriched = await enrichMatchEvent(matchId);
          await emitBotEvent('match.scheduled', {
            matchId,
            tournamentId: updated.tournament_id ?? null,
            scrimId: updated.scrim_id ?? null,
            scheduledAt: next,
            enriched,
          });
        })().catch((e) =>
          logger.error('[botEvents] match.scheduled emit error:', e)
        );
      } else {
        void emitBotEvent('match.unscheduled', { matchId }).catch((e) =>
          logger.error('[botEvents] match.unscheduled emit error:', e)
        );
      }
    }
  }

  return res.status(200).json({
    match: updated,
    ...(warnings.length > 0 ? { warnings } : {}),
  });
}

/* -----------------------------------------------------------
 * Discord helper: build & send the "match starting" notification
 * ---------------------------------------------------------*/

async function notifyMatchStartingForMatch(matchId: string): Promise<void> {
  if (!supabaseAdmin) return;

  const { data: m } = await supabaseAdmin
    .from('matches')
    .select(
      `
      id,
      tournament_id,
      round_name,
      match_format,
      lobby_code,
      stream_url,
      scheduled_at,
      team1:team1_id(id, name, logo_url, discord_role_id),
      team2:team2_id(id, name, logo_url, discord_role_id),
      tournament:tournament_id(id, name)
      `
    )
    .eq('id', matchId)
    .maybeSingle();

  if (!m || !m.team1 || !m.team2) return;

  const t1 = Array.isArray(m.team1) ? m.team1[0] : m.team1;
  const t2 = Array.isArray(m.team2) ? m.team2[0] : m.team2;
  const tn = Array.isArray(m.tournament) ? m.tournament[0] : m.tournament;

  if (!t1 || !t2) return;

  await notifyMatchStarting({
    tournamentId: m.tournament_id ?? null,
    tournamentName: tn?.name ?? null,
    matchId: m.id,
    roundName: m.round_name ?? null,
    matchFormat: m.match_format ?? null,
    lobbyCode: m.lobby_code ?? null,
    streamUrl: m.stream_url ?? null,
    scheduledAt: m.scheduled_at ?? null,
    team1: {
      name: t1.name,
      logoUrl: t1.logo_url ?? null,
      discordRoleId: t1.discord_role_id ?? null,
    },
    team2: {
      name: t2.name,
      logoUrl: t2.logo_url ?? null,
      discordRoleId: t2.discord_role_id ?? null,
    },
  });
}

/* -----------------------------------------------------------
 * DELETE :
 *  - par défaut : status="cancelled" + reset scores + winner
 *  - query.hard=1 : suppression DB
 * ---------------------------------------------------------*/

async function handleDelete(
  matchId: string,
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const hard = req.query.hard === '1' || req.query.hard === 'true';

  const { data: match, error: fetchErr } = await supabaseAdmin
    .from('matches')
    .select('*')
    .eq('id', matchId)
    .maybeSingle();

  if (fetchErr || !match) {
    return res.status(404).json({ error: 'Match not found' });
  }

  if (hard) {
    const { error } = await supabaseAdmin
      .from('matches')
      .delete()
      .eq('id', matchId);

    if (error) {
      logger.error('admin hard delete match error:', error);
      return res.status(500).json({
        error: 'Failed to hard-delete match',
      });
    }

    if (ctx?.staff?.id) {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'delete_match',
        entity_type: 'match',
        entity_id: matchId,
        tournament_id: match.tournament_id ?? null,
        payload: {
          hard_delete: true,
        },
      });
    }

    return res.status(200).json({
      success: true,
      hardDeleted: true,
    });
  }

  // Soft delete / cancel
  const { error } = await supabaseAdmin
    .from('matches')
    .update({
      status: 'cancelled',
      team1_score: null,
      team2_score: null,
      winner_team_id: null,
    })
    .eq('id', matchId);

  if (error) {
    logger.error('admin cancel match error:', error);
    return res.status(500).json({
      error: 'Failed to cancel match',
    });
  }

  if (ctx?.staff?.id) {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'update_match',
      entity_type: 'match',
      entity_id: matchId,
      tournament_id: match.tournament_id ?? null,
      payload: {
        cancelled: true,
        hard_delete: false,
      },
    });
  }

  return res.status(200).json({
    success: true,
    hardDeleted: false,
  });
}

/* -----------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------*/

function hasScorePayload(body: any): boolean {
  return (
    typeof body?.team1Score === 'number' && typeof body?.team2Score === 'number'
  );
}
