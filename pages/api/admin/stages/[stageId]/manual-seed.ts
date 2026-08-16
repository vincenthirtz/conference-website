// pages/api/admin/stages/[stageId]/manual-seed.ts
//
// POST : variante manuelle de /auto-seed. L'admin fournit explicitement
// les paires (matchId, slot, teamId) plutôt que de calculer depuis les
// standings d'un stage source.
//
// Use cases :
//   - tournoi sans phase qualif → l'admin saisit les seeds à la main
//   - override d'un seeding auto contesté
//   - placement de wildcards / showmatches
//
// Body : { assignments: [{ matchId, slot, teamId, seed? }], replaceExisting?: boolean }
//
// Validations :
//   - target stage doit être de type 'bracket'
//   - tous les matchIds appartiennent au stage cible ET round_number = 1
//   - chaque (matchId, slot) n'apparaît qu'une fois
//   - chaque teamId n'apparaît qu'une fois
//   - sans replaceExisting=true, refus si le slot est déjà rempli

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { withAdminIdempotency } from '@/utils/adminIdempotency';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '../../../../../utils/logger';

type Assignment = {
  matchId: string;
  slot: 1 | 2;
  teamId: string;
  seed?: number;
};

type SeededSlot = {
  matchId: string;
  slot: 1 | 2;
  teamId: string;
  seed: number | null;
};

type ApiResponse =
  | { seeded: SeededSlot[]; totalMatches: number }
  | {
      error: string;
      code?: string;
      conflicts?: { matchId: string; slot: 1 | 2; currentTeamId: string }[];
    };

export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'stage-manual-seed' }),
  'admin'
);

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
  ctx: AuthenticatedStaffContext
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { stageId } = req.query;
  if (!stageId || Array.isArray(stageId) || !isValidUUID(stageId)) {
    return res.status(400).json({ error: 'Invalid stageId' });
  }
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Database service unavailable.' });
  }

  const targetStageId = String(stageId);
  const body = (req.body ?? {}) as {
    assignments?: unknown;
    replaceExisting?: unknown;
  };

  const rawAssignments = body.assignments;
  const replaceExisting = body.replaceExisting === true;

  if (!Array.isArray(rawAssignments) || rawAssignments.length === 0) {
    return res
      .status(400)
      .json({ error: 'assignments doit être un tableau non vide.' });
  }

  // ---- Validation de la forme ----
  const assignments: Assignment[] = [];
  for (const raw of rawAssignments) {
    if (!raw || typeof raw !== 'object') {
      return res.status(400).json({ error: 'assignments[] : object attendu.' });
    }
    const a = raw as Record<string, unknown>;
    if (typeof a.matchId !== 'string' || !isValidUUID(a.matchId)) {
      return res
        .status(400)
        .json({
          error: `matchId invalide : ${String(a.matchId).slice(0, 40)}`,
        });
    }
    if (typeof a.teamId !== 'string' || !isValidUUID(a.teamId)) {
      return res
        .status(400)
        .json({ error: `teamId invalide : ${String(a.teamId).slice(0, 40)}` });
    }
    if (a.slot !== 1 && a.slot !== 2) {
      return res.status(400).json({ error: 'slot doit valoir 1 ou 2.' });
    }
    const seed =
      typeof a.seed === 'number' && Number.isInteger(a.seed) && a.seed > 0
        ? a.seed
        : undefined;
    assignments.push({
      matchId: a.matchId,
      slot: a.slot as 1 | 2,
      teamId: a.teamId,
      seed,
    });
  }

  // Vérifier unicité (matchId, slot)
  const slotKey = new Set<string>();
  for (const a of assignments) {
    const k = `${a.matchId}:${a.slot}`;
    if (slotKey.has(k)) {
      return res
        .status(400)
        .json({ error: `Slot dupliqué dans assignments : ${k}.` });
    }
    slotKey.add(k);
  }

  // Vérifier unicité teamId
  const teamCount = new Map<string, number>();
  for (const a of assignments) {
    teamCount.set(a.teamId, (teamCount.get(a.teamId) ?? 0) + 1);
  }
  const dupTeam = [...teamCount.entries()].find(([, n]) => n > 1);
  if (dupTeam) {
    return res
      .status(400)
      .json({ error: `Équipe assignée plusieurs fois : ${dupTeam[0]}.` });
  }

  try {
    // ---- Vérifier que le stage cible est un bracket ----
    const { data: stage, error: stageErr } = await supabaseAdmin
      .from('tournament_stages')
      .select('id, tournament_id, stage_type')
      .eq('id', targetStageId)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle();
    if (stageErr || !stage) {
      return res.status(404).json({ error: 'Stage cible introuvable.' });
    }
    if (stage.stage_type !== 'bracket') {
      return res
        .status(400)
        .json({ error: 'Le stage cible doit être un bracket.' });
    }

    // ---- Vérifier que tous les matches sont round 1 du stage cible ----
    const matchIds = [...new Set(assignments.map((a) => a.matchId))];
    const { data: matches, error: matchErr } = await supabaseAdmin
      .from('matches')
      .select('id, stage_id, round_number, team1_id, team2_id, status')
      .eq('tenant_id', ctx.tenantId)
      .in('id', matchIds);
    if (matchErr) {
      logger.error('[manual-seed] fetch matches error', matchErr);
      return res
        .status(500)
        .json({ error: 'Erreur lors du chargement des matchs.' });
    }
    const matchById = new Map((matches ?? []).map((m) => [m.id, m]));
    for (const a of assignments) {
      const m = matchById.get(a.matchId);
      if (!m) {
        return res.status(400).json({ error: `Match inconnu : ${a.matchId}.` });
      }
      if (m.stage_id !== targetStageId) {
        return res.status(400).json({
          error: `Match ${a.matchId} n'appartient pas au stage cible.`,
        });
      }
      if (m.round_number !== 1) {
        return res.status(400).json({
          error: `Match ${a.matchId} n'est pas dans le round 1.`,
        });
      }
    }

    // Lock guard : si un seul des matches ciblés est ongoing/finished/walkover,
    // on refuse le re-seed pour éviter une corruption du bracket aval.
    const locked = (matches ?? []).filter(
      (m) =>
        m.status === 'ongoing' ||
        m.status === 'finished' ||
        m.status === 'walkover'
    );
    if (locked.length > 0) {
      return res.status(409).json({
        error: `Impossible de re-seed : ${locked.length} match(es) déjà joué(s) ou en cours.`,
        code: 'STAGE_LOCKED',
      });
    }

    // ---- Conflits : slot déjà rempli ? ----
    if (!replaceExisting) {
      const conflicts: {
        matchId: string;
        slot: 1 | 2;
        currentTeamId: string;
      }[] = [];
      for (const a of assignments) {
        const m = matchById.get(a.matchId);
        if (!m) continue;
        const currentId = a.slot === 1 ? m.team1_id : m.team2_id;
        if (currentId && currentId !== a.teamId) {
          conflicts.push({
            matchId: a.matchId,
            slot: a.slot,
            currentTeamId: currentId,
          });
        }
      }
      if (conflicts.length > 0) {
        return res.status(409).json({
          error:
            'Certains slots sont déjà remplis. Passer replaceExisting=true pour écraser.',
          code: 'SLOT_CONFLICT',
          conflicts,
        });
      }
    }

    // ---- Vérifier existence des teams ----
    const teamIds = [...new Set(assignments.map((a) => a.teamId))];
    const { data: teams, error: teamsErr } = await supabaseAdmin
      .from('teams')
      .select('id')
      .eq('tenant_id', ctx.tenantId)
      .in('id', teamIds);
    if (teamsErr) {
      logger.error('[manual-seed] fetch teams error', teamsErr);
      return res
        .status(500)
        .json({ error: 'Erreur lors du chargement des équipes.' });
    }
    const foundIds = new Set((teams ?? []).map((t) => t.id));
    const missing = teamIds.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      return res.status(400).json({
        error: `Équipes inconnues : ${missing.join(', ')}.`,
      });
    }

    // ---- Apply updates ----
    const seeded: SeededSlot[] = [];
    for (const a of assignments) {
      const field = a.slot === 1 ? 'team1_id' : 'team2_id';
      const { error: updErr } = await supabaseAdmin
        .from('matches')
        .update({ [field]: a.teamId, updated_at: new Date().toISOString() })
        .eq('id', a.matchId)
        .eq('tenant_id', ctx.tenantId);
      if (updErr) {
        logger.error('[manual-seed] update match error', updErr);
        continue;
      }
      seeded.push({
        matchId: a.matchId,
        slot: a.slot,
        teamId: a.teamId,
        seed: a.seed ?? null,
      });
    }

    // ---- Upsert stage_teams pour cohérence ----
    const { data: existing } = await supabaseAdmin
      .from('stage_teams')
      .select('team_id')
      .eq('tenant_id', ctx.tenantId)
      .eq('stage_id', targetStageId);
    const existingIds = new Set(
      (existing ?? []).map((r: { team_id: string }) => r.team_id)
    );
    const inserts = assignments
      .filter((a) => !existingIds.has(a.teamId))
      .map((a) => ({
        tenant_id: ctx.tenantId,
        stage_id: targetStageId,
        team_id: a.teamId,
        seed: a.seed ?? null,
        is_substitute: false,
        notes: null,
      }));
    if (inserts.length > 0) {
      await supabaseAdmin.from('stage_teams').insert(inserts);
    }

    // ---- Log staff ----
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'auto_seed_bracket',
      entity_type: 'stage',
      entity_id: targetStageId,
      tournament_id: stage.tournament_id,
      payload: {
        mode: 'manual',
        seeded_count: seeded.length,
        replace_existing: replaceExisting,
      },
    });

    return res.status(200).json({
      seeded,
      totalMatches: matchIds.length,
    });
  } catch (err) {
    logger.error('[manual-seed] internal error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
