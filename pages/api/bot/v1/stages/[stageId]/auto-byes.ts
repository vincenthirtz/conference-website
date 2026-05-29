// POST /api/bot/v1/stages/[stageId]/auto-byes
//
// Commande /auto-byes (admin) : detecte les matchs incomplets (une seule
// equipe assignee) dans un stage et les marque BYE avec score auto +
// propagation bracket. Mirror du admin route admin/stages/[stageId]/auto-byes.
//
// Body :
//   - actorDiscordUserId (staff admin/owner)
//   - roundNumber? (filter sur un round precis)
//   - scoreForBye? (defaut 1)
//   - propagate? (defaut true)

import { z } from 'zod';
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute } from '@/utils/botAuth';
import { requireBotStaff, logBotStaffAction } from '@/utils/botActor';
import { discordIdSchema, uuidSchema } from '@/utils/botValidation';
import {
  resetPropagationForMatch,
  propagateBracketForMatch,
} from '@/utils/bracket/propagate';
import { logger } from '@/utils/logger';

// scoreForBye historique : nombre >= 0 (non forcément entier), défaut 1.
// propagate : seul `false` explicite le désactive (défaut true).
const autoByesBodySchema = z.object({
  actorDiscordUserId: discordIdSchema,
  roundNumber: z.number().int().optional(),
  scoreForBye: z.number().min(0).optional(),
  propagate: z.boolean().optional(),
});
const autoByesQuerySchema = z.object({ stageId: uuidSchema });

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { stageId } = req.botQuery as z.infer<typeof autoByesQuerySchema>;

  const actor = await requireBotStaff(req, res, req.body ?? {});
  if (!actor) return;

  const input = req.botInput as z.infer<typeof autoByesBodySchema>;
  const roundNumber = input.roundNumber;
  const scoreForBye = input.scoreForBye ?? 1;
  const propagate = input.propagate !== false;

  const { data: stage, error: stErr } = await supabaseAdmin
    .from('tournament_stages')
    .select('id, tournament_id')
    .eq('tenant_id', req.botContext!.tenantId)
    .eq('id', stageId)
    .maybeSingle();
  if (stErr) {
    logger.error('[bot/auto-byes] stage lookup error', stErr);
    return res.status(500).json({ error: 'Erreur de chargement du stage' });
  }
  if (!stage) {
    return res.status(404).json({ error: 'Stage introuvable' });
  }
  const tournamentId: string | null = stage.tournament_id ?? null;

  let q = supabaseAdmin
    .from('matches')
    .select(`id, status, is_bye, round_number, team1_id, team2_id`)
    .eq('tenant_id', req.botContext!.tenantId)
    .eq('stage_id', stageId)
    .neq('status', 'cancelled');
  if (roundNumber !== undefined) q = q.eq('round_number', roundNumber);

  const { data: matches, error: mErr } = await q;
  if (mErr) {
    logger.error('[bot/auto-byes] matches list error', mErr);
    return res.status(500).json({ error: 'Erreur de chargement des matchs' });
  }

  const candidates = (matches ?? []).filter((m) => {
    const r = m as {
      is_bye: boolean | null;
      team1_id: string | null;
      team2_id: string | null;
    };
    if (r.is_bye) return false;
    const hasT1 = !!r.team1_id;
    const hasT2 = !!r.team2_id;
    return hasT1 !== hasT2;
  });

  const updatedMatchIds: string[] = [];
  const failed: { matchId: string; reason: string }[] = [];

  for (const c of candidates) {
    const m = c as {
      id: string;
      team1_id: string | null;
      team2_id: string | null;
    };
    try {
      const winnerTeamId = m.team1_id || m.team2_id;
      if (!winnerTeamId) throw new Error('Aucune équipe à promouvoir');

      const team1_score = m.team1_id === winnerTeamId ? scoreForBye : 0;
      const team2_score = m.team2_id === winnerTeamId ? scoreForBye : 0;

      await resetPropagationForMatch(req.botContext!.tenantId, m.id);

      const { error: upErr } = await supabaseAdmin
        .from('matches')
        .update({
          is_bye: true,
          status: 'finished',
          winner_team_id: winnerTeamId,
          team1_score,
          team2_score,
          completed_at: new Date().toISOString(),
        })
        .eq('tenant_id', req.botContext!.tenantId)
        .eq('id', m.id);
      if (upErr) throw upErr;

      if (propagate) {
        try {
          await propagateBracketForMatch(req.botContext!.tenantId, m.id);
        } catch (e) {
          logger.error('[bot/auto-byes] propagation error', m.id, e);
          // Match marque comme bye ok, on continue.
        }
      }
      updatedMatchIds.push(m.id);
    } catch (e) {
      failed.push({
        matchId: m.id,
        reason: e instanceof Error ? e.message : String(e),
      });
    }
  }

  await logBotStaffAction({
    staffId: actor.staffId,
    action: 'staff_batch_action',
    entity_type: 'match_auto_byes',
    tournament_id: tournamentId,
    payload: {
      stage_id: stageId,
      round_number: roundNumber ?? null,
      score_for_bye: scoreForBye,
      propagate,
      updated_match_ids: updatedMatchIds,
      failed,
    },
  });

  return res.status(200).json({
    stageId,
    tournamentId,
    roundNumber: roundNumber ?? null,
    updatedMatchIds,
    failed,
  });
}

export default withBotRoute(handler, {
  methods: ['POST'],
  rateLimit: { max: 10, key: 'bot-stage-auto-byes' },
  idempotent: true,
  bodySchema: autoByesBodySchema,
  querySchema: autoByesQuerySchema,
});
