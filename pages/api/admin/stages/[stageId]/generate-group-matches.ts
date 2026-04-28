// pages/api/admin/stages/[stageId]/generate-group-matches.ts
// Genere automatiquement les matchs round-robin pour chaque poule d'un stage de type 'group'.
//
// POST : pour chaque groupe (cf. settings.group_assignments), cree les matchs.
// Body :
//   { dryRun?: boolean, rounds?: number, matchFormat?: string }
//
// Pre-requis :
//   - stage.stage_type === 'group'
//   - settings.group_assignments doit etre defini (sinon utiliser /groups POST snake/random d'abord)
//   - aucun match deja existant pour ce stage (sinon il faut effacer avant de regenerer)

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { isValidUUID } from '@/utils/apiHelpers';
import { generateRoundRobinPairings } from '@/utils/groups/roundRobin';
import type { MatchStatus } from '@/types/admin';

type DryRunPairing = {
  group_key: string;
  round_number: number;
  team1_id: string | null;
  team2_id: string | null;
  is_bye: boolean;
};

type ApiResponse =
  | {
      stageId: string;
      dryRun?: boolean;
      preview?: DryRunPairing[];
      createdMatchIds?: string[];
      groupCount?: number;
      perGroupRounds?: number;
    }
  | { error: string };

export default withStaffRoute(handler, 'manager');

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
  ctx: any
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { stageId } = req.query;
  if (!stageId || Array.isArray(stageId) || !isValidUUID(stageId)) {
    return res.status(400).json({ error: 'Invalid stageId' });
  }

  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }

  const id = String(stageId);
  const body = (req.body || {}) as {
    dryRun?: boolean;
    rounds?: number;
    matchFormat?: string;
  };

  try {
    // 1) Charger le stage
    const { data: stage, error: stageErr } = await supabaseAdmin
      .from('tournament_stages')
      .select('id, tournament_id, stage_type, settings')
      .eq('id', id)
      .maybeSingle();

    if (stageErr || !stage) {
      return res.status(404).json({ error: 'Stage not found' });
    }

    if (stage.stage_type !== 'group' && stage.stage_type !== 'round_robin') {
      return res.status(400).json({
        error:
          "Cet endpoint ne supporte que les stages 'group' ou 'round_robin'.",
      });
    }

    // 2) Verifier qu'il y a des assignations de groupes
    const groupAssignments: Record<string, string[]> =
      stage.settings?.group_assignments || {};
    const groupKeys = Object.keys(groupAssignments).filter(
      (k) =>
        Array.isArray(groupAssignments[k]) && groupAssignments[k].length >= 2
    );

    if (groupKeys.length === 0) {
      return res.status(400).json({
        error:
          "Aucune assignation de groupe trouvee. Distribuez d'abord les equipes via POST /api/admin/stages/{stageId}/groups.",
      });
    }

    // 3) Verifier qu'aucun match n'existe deja (sauf cancelled)
    if (!body.dryRun) {
      const { data: existingMatches, error: existErr } = await supabaseAdmin
        .from('matches')
        .select('id, status')
        .eq('stage_id', id)
        .neq('status', 'cancelled');

      if (existErr) {
        return res
          .status(500)
          .json({ error: 'Failed to check existing matches' });
      }

      if (existingMatches && existingMatches.length > 0) {
        return res.status(409).json({
          error: `Des matchs existent deja pour ce stage (${existingMatches.length}). Annulez-les avant de regenerer.`,
        });
      }
    }

    // 4) Determiner le nombre de rounds (cycles aller / aller-retour)
    const settingsRounds =
      typeof stage.settings?.rounds === 'number'
        ? stage.settings.rounds
        : stage.settings?.home_away
          ? 2
          : 1;
    const rounds = Math.max(
      1,
      Math.min(10, body.rounds ?? settingsRounds ?? 1)
    );

    // 5) Generer les pairings pour chaque groupe
    const matchFormat: string =
      body.matchFormat || stage.settings?.match_format || 'bo3';
    const allPairings: DryRunPairing[] = [];

    for (const gk of groupKeys) {
      const ids = groupAssignments[gk];
      const pairings = generateRoundRobinPairings(ids, rounds);
      for (const p of pairings) {
        allPairings.push({
          group_key: gk,
          round_number: p.round,
          team1_id: p.team1Id,
          team2_id: p.team2Id,
          is_bye: p.team2Id === null,
        });
      }
    }

    // 6) Dry run : on retourne juste le preview
    if (body.dryRun) {
      return res.status(200).json({
        stageId: id,
        dryRun: true,
        preview: allPairings,
        groupCount: groupKeys.length,
        perGroupRounds: rounds,
      });
    }

    // 7) Insertion des matchs
    const nowIso = new Date().toISOString();
    const inserts = allPairings.map((p) => ({
      tournament_id: stage.tournament_id,
      stage_id: id,
      status: (p.is_bye ? 'finished' : 'pending') as MatchStatus,
      is_bye: p.is_bye,
      match_format: matchFormat,
      round_name: `Poule ${p.group_key} · Round ${p.round_number}`,
      round_number: p.round_number,
      bracket_side: 'none',
      group_key: p.group_key,
      team1_id: p.team1_id,
      team2_id: p.team2_id,
      team1_score: p.is_bye ? 1 : null,
      team2_score: p.is_bye ? 0 : null,
      winner_team_id: p.is_bye ? p.team1_id : null,
      scheduled_at: null,
      completed_at: p.is_bye ? nowIso : null,
      stream_url: null,
      lobby_code: null,
      notes: null,
      next_match_win_id: null,
      next_match_win_slot: null,
      next_match_lose_id: null,
      next_match_lose_slot: null,
      created_at: nowIso,
      updated_at: null,
    }));

    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from('matches')
      .insert(inserts)
      .select('id');

    if (insertErr || !inserted) {
      console.error('generate-group-matches insert error:', insertErr);
      return res.status(500).json({ error: 'Failed to insert group matches' });
    }

    const createdMatchIds = inserted.map((m: any) => m.id);

    // 8) Log staff
    if (ctx?.staff?.id) {
      try {
        await logStaffAction({
          staff_id: ctx.staff.id,
          action: 'generate_group_matches',
          entity_type: 'stage',
          entity_id: id,
          tournament_id: stage.tournament_id,
          payload: {
            stage_id: id,
            group_count: groupKeys.length,
            rounds,
            match_count: createdMatchIds.length,
          },
        });
      } catch (e) {
        console.error('generate-group-matches logStaffAction error:', e);
      }
    }

    return res.status(200).json({
      stageId: id,
      createdMatchIds,
      groupCount: groupKeys.length,
      perGroupRounds: rounds,
    });
  } catch (err: unknown) {
    console.error(
      '[/api/admin/stages/[stageId]/generate-group-matches] error:',
      err
    );
    return res.status(500).json({ error: 'Internal server error' });
  }
}
