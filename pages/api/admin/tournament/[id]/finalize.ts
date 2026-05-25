// pages/api/admin/tournament/[id]/finalize.ts
// POST : fige le podium d'un tournoi.
//   - Insère/remplace les lignes final_rankings pour ce tournoi.
//   - Transitionne tournament.status -> 'completed' (depuis 'running').
//   - Log staff_logs + emit bot event 'tournament.finalized'.
//
// Idempotence : ré-appeler avec le même payload sur un tournoi déjà
// finalisé renvoie 200 sans rien changer. Pour réécrire un ranking déjà
// figé, le caller doit passer { force: true } — l'opération est alors
// loggée comme 'unfinalize_tournament' + 'finalize_tournament' successifs.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { isValidUUID } from '@/utils/apiHelpers';
import { emitBotEvent } from '@/utils/botEvents';
import { withAdminIdempotency } from '@/utils/adminIdempotency';
import { logger } from '../../../../../utils/logger';

type RankingInput = {
  team_id: string;
  rank: number;
  prize?: string | null;
  notes?: string | null;
};

type FinalizeBody = {
  rankings?: RankingInput[];
  force?: boolean;
};

type ApiResponse =
  | {
      success: true;
      tournament: { id: string; name: string; status: string };
      rankings: Array<{
        team_id: string;
        team_name: string;
        rank: number;
        prize: string | null;
        notes: string | null;
        frozen_at: string;
      }>;
      already_finalized: boolean;
    }
  | { error: string; details?: unknown };

export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'tournament-finalize' }),
  'manager'
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
  const body = (req.body ?? {}) as FinalizeBody;
  const force = body.force === true;
  const rankingsInput = Array.isArray(body.rankings) ? body.rankings : [];

  // --- Validation payload ---
  if (rankingsInput.length === 0) {
    return res
      .status(400)
      .json({ error: 'rankings must be a non-empty array' });
  }

  const seenTeamIds = new Set<string>();
  const seenRanks = new Set<number>();
  for (const r of rankingsInput) {
    if (!r.team_id || !isValidUUID(r.team_id)) {
      return res
        .status(400)
        .json({ error: 'Each ranking entry must have a valid team_id (UUID)' });
    }
    if (!Number.isInteger(r.rank) || r.rank < 1) {
      return res
        .status(400)
        .json({ error: 'Each ranking entry must have rank >= 1 (integer)' });
    }
    if (seenTeamIds.has(r.team_id)) {
      return res
        .status(400)
        .json({ error: `Duplicate team_id in rankings: ${r.team_id}` });
    }
    if (seenRanks.has(r.rank)) {
      return res
        .status(400)
        .json({ error: `Duplicate rank in rankings: ${r.rank}` });
    }
    seenTeamIds.add(r.team_id);
    seenRanks.add(r.rank);
  }

  // Ranks doivent former 1..N consécutifs (pas de trous, pas de skip)
  const sortedRanks = [...seenRanks].sort((a, b) => a - b);
  for (let i = 0; i < sortedRanks.length; i++) {
    if (sortedRanks[i] !== i + 1) {
      return res.status(400).json({
        error: `Ranks must be consecutive starting at 1 (got ${sortedRanks.join(', ')})`,
      });
    }
  }

  try {
    // --- Fetch tournament ---
    const { data: tournament } = await supabaseAdmin
      .from('tournaments')
      .select('id, name, status, tenant_id')
      .eq('id', tournamentId)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle();

    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    // --- Status guard ---
    // Allowed transitions:
    //   running    -> completed (normal path)
    //   completed  -> completed (idempotent replay OR force overwrite)
    if (tournament.status !== 'running' && tournament.status !== 'completed') {
      return res.status(409).json({
        error: `Cannot finalize tournament in status '${tournament.status}'. Status must be 'running'.`,
      });
    }

    // --- Validate team_ids belong to tournament_teams ---
    const teamIds = rankingsInput.map((r) => r.team_id);
    const { data: registeredTeams } = await supabaseAdmin
      .from('tournament_teams')
      .select('team_id')
      .eq('tournament_id', tournamentId)
      .eq('tenant_id', ctx.tenantId)
      .in('team_id', teamIds);

    const registeredSet = new Set(
      (registeredTeams ?? []).map((r) => r.team_id as string)
    );
    const unknownTeams = teamIds.filter((t) => !registeredSet.has(t));
    if (unknownTeams.length > 0) {
      return res.status(400).json({
        error: 'Some team_ids are not registered in this tournament',
        details: { unknown_team_ids: unknownTeams },
      });
    }

    // --- Idempotency check : compare against existing final_rankings ---
    const { data: existing } = await supabaseAdmin
      .from('final_rankings')
      .select('team_id, rank, prize, notes')
      .eq('tournament_id', tournamentId)
      .order('rank', { ascending: true });

    const existingArr = existing ?? [];
    const isIdentical =
      existingArr.length === rankingsInput.length &&
      existingArr.every((e) => {
        const incoming = rankingsInput.find((r) => r.team_id === e.team_id);
        return (
          incoming &&
          incoming.rank === e.rank &&
          (incoming.prize ?? null) === (e.prize ?? null) &&
          (incoming.notes ?? null) === (e.notes ?? null)
        );
      });

    if (existingArr.length > 0 && !isIdentical && !force) {
      return res.status(409).json({
        error:
          'Tournament is already finalized with a different ranking. Send { force: true } to overwrite.',
      });
    }

    const alreadyFinalized = existingArr.length > 0 && isIdentical;

    if (alreadyFinalized) {
      // No-op : on renvoie l'état actuel sans toucher à la DB.
      const rankings = await fetchRankingsWithNames(tournamentId);
      return res.status(200).json({
        success: true,
        tournament: {
          id: tournament.id,
          name: tournament.name,
          status: tournament.status ?? 'completed',
        },
        rankings,
        already_finalized: true,
      });
    }

    // --- Apply : delete existing + insert new + update status ---
    const staffId = ctx.staff?.id ?? null;
    const nowIso = new Date().toISOString();

    if (existingArr.length > 0 && force) {
      const { error: delErr } = await supabaseAdmin
        .from('final_rankings')
        .delete()
        .eq('tournament_id', tournamentId);
      if (delErr) {
        logger.error('[finalize] delete existing error', delErr);
        return res
          .status(500)
          .json({ error: 'Failed to overwrite existing rankings' });
      }
      // Log the unfinalize step distinctly so the audit trail is unambiguous.
      if (staffId) {
        await logStaffAction({
          staff_id: staffId,
          action: 'unfinalize_tournament',
          entity_type: 'tournament',
          entity_id: tournamentId,
          tournament_id: tournamentId,
          payload: { force: true, replaced_count: existingArr.length },
          tenant_id: ctx.tenantId,
        });
      }
    }

    const rowsToInsert = rankingsInput.map((r) => ({
      tournament_id: tournamentId,
      tenant_id: ctx.tenantId,
      team_id: r.team_id,
      rank: r.rank,
      prize: r.prize ?? null,
      notes: r.notes ?? null,
      frozen_at: nowIso,
      frozen_by_staff_id: staffId,
    }));

    const { error: insertErr } = await supabaseAdmin
      .from('final_rankings')
      .insert(rowsToInsert);

    if (insertErr) {
      logger.error('[finalize] insert error', insertErr);
      return res
        .status(500)
        .json({ error: 'Failed to insert final rankings' });
    }

    if (tournament.status !== 'completed') {
      const { error: statusErr } = await supabaseAdmin
        .from('tournaments')
        .update({ status: 'completed', updated_at: nowIso })
        .eq('id', tournamentId)
        .eq('tenant_id', ctx.tenantId);
      if (statusErr) {
        logger.error('[finalize] status update error', statusErr);
        // Pas de rollback automatique : les rankings sont insérés mais le
        // statut reste 'running'. On loggue et on renvoie 500 — l'opérateur
        // pourra re-appeler finalize (idempotent) ou ajuster manuellement.
        return res.status(500).json({
          error:
            'Rankings inserted but failed to update tournament status. Re-run finalize to retry.',
        });
      }
    }

    // --- Audit + bot event ---
    if (staffId) {
      await logStaffAction({
        staff_id: staffId,
        action: 'finalize_tournament',
        entity_type: 'tournament',
        entity_id: tournamentId,
        tournament_id: tournamentId,
        payload: {
          force,
          team_count: rankingsInput.length,
          rankings: rankingsInput.map((r) => ({
            team_id: r.team_id,
            rank: r.rank,
          })),
        },
        tenant_id: ctx.tenantId,
      });
    }

    const rankings = await fetchRankingsWithNames(tournamentId);

    // Bot event — best-effort, ne bloque pas la réponse en cas d'échec.
    try {
      await emitBotEvent(
        'tournament.finalized',
        {
          tournament_id: tournamentId,
          tournament_name: tournament.name,
          rankings: rankings.map((r) => ({
            team_id: r.team_id,
            team_name: r.team_name,
            rank: r.rank,
            prize: r.prize,
          })),
        },
        ctx.tenantId
      );
    } catch (eventErr) {
      logger.error('[finalize] emitBotEvent error (non-fatal)', eventErr);
    }

    return res.status(200).json({
      success: true,
      tournament: {
        id: tournament.id,
        name: tournament.name,
        status: 'completed',
      },
      rankings,
      already_finalized: false,
    });
  } catch (err: unknown) {
    logger.error('[/api/admin/tournament/[id]/finalize] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function fetchRankingsWithNames(
  tournamentId: string
): Promise<
  Array<{
    team_id: string;
    team_name: string;
    rank: number;
    prize: string | null;
    notes: string | null;
    frozen_at: string;
  }>
> {
  if (!supabaseAdmin) return [];
  const { data } = await supabaseAdmin
    .from('final_rankings')
    .select(
      'team_id, rank, prize, notes, frozen_at, teams:teams!inner(name)'
    )
    .eq('tournament_id', tournamentId)
    .order('rank', { ascending: true });

  return (data ?? []).map((r: any) => ({
    team_id: r.team_id,
    team_name: r.teams?.name ?? 'Équipe inconnue',
    rank: r.rank,
    prize: r.prize,
    notes: r.notes,
    frozen_at: r.frozen_at,
  }));
}
