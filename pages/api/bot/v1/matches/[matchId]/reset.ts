// POST /api/bot/v1/matches/[matchId]/reset
//
// Commande /reset-match (admin) : remet un match a zero (scores nuls,
// status='pending', winner/forfeit/dispute clears). Utile pour ressaisir
// un score apres erreur ou apres avoir leve une dispute.
//
// ⚠️ NE de-propage PAS le bracket : si le match etait deja finalise et que
// le winner s'etait propage dans next_match_win_id, les matchs suivants
// gardent leur etat. L'admin doit nettoyer manuellement les matchs
// suivants si necessaire (le bot signale ca dans la reponse).
//
// Auth : x-api-key + actorDiscordUserId staff admin/owner.

import { z } from 'zod';
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute } from '@/utils/botAuth';
import { requireBotStaff, logBotStaffAction } from '@/utils/botActor';
import { discordIdSchema, uuidSchema } from '@/utils/botValidation';
import { logger } from '@/utils/logger';

const TERMINAL_BEFORE = new Set([
  'finished',
  'walkover',
  'cancelled',
  'disputed',
]);

const resetBodySchema = z.object({ actorDiscordUserId: discordIdSchema });
const resetQuerySchema = z.object({ matchId: uuidSchema });

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { matchId } = req.botQuery as z.infer<typeof resetQuerySchema>;

  const body = (req.body ?? {}) as Record<string, unknown>;

  const actor = await requireBotStaff(req, res, body);
  if (!actor) return;

  const { data: match, error: mErr } = await supabaseAdmin
    .from('matches')
    .select(
      `id, tournament_id, status, team1_score, team2_score, winner_team_id,
       forfeit_team_id, is_bye, next_match_win_id, next_match_lose_id`
    )
    .eq('tenant_id', req.botContext!.tenantId)
    .eq('id', matchId)
    .maybeSingle();
  if (mErr) {
    logger.error('[bot/match/reset] lookup error', mErr);
    return res.status(500).json({ error: 'Erreur de chargement du match' });
  }
  if (!match) {
    return res.status(404).json({ error: 'Match introuvable' });
  }
  if (match.is_bye) {
    return res
      .status(400)
      .json({ error: 'Un match bye ne peut pas être reset.' });
  }

  // Verifie si le tournoi parent est completed -> aligne sur applyMatchScore.
  if (match.tournament_id) {
    const { data: tournament } = await supabaseAdmin
      .from('tournaments')
      .select('status')
      .eq('tenant_id', req.botContext!.tenantId)
      .eq('id', match.tournament_id)
      .maybeSingle();
    if (tournament?.status === 'completed') {
      return res.status(403).json({
        error:
          "Impossible de reset : le tournoi est terminé. Réouvrez-le d'abord depuis l'admin UI.",
        code: 'TOURNAMENT_COMPLETED',
      });
    }
  }

  const wasFinalized = TERMINAL_BEFORE.has(match.status);
  const hadPropagation = !!(
    match.next_match_win_id || match.next_match_lose_id
  );

  const { data: updated, error: updErr } = await supabaseAdmin
    .from('matches')
    .update({
      status: 'pending',
      team1_score: null,
      team2_score: null,
      winner_team_id: null,
      forfeit_team_id: null,
      completed_at: null,
      dispute_reason: null,
      dispute_opened_by: null,
      dispute_opened_at: null,
      dispute_resolution: null,
      dispute_resolved_by: null,
      dispute_resolved_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', req.botContext!.tenantId)
    .eq('id', matchId)
    .select('id, status')
    .maybeSingle();
  if (updErr || !updated) {
    logger.error('[bot/match/reset] update error', updErr);
    return res.status(500).json({ error: 'Échec du reset' });
  }

  await logBotStaffAction({
    staffId: actor.staffId,
    action: 'update_match',
    entity_type: 'match',
    entity_id: matchId,
    tournament_id: match.tournament_id ?? null,
    payload: {
      action_type: 'reset',
      previous_status: match.status,
      previous_team1_score: match.team1_score,
      previous_team2_score: match.team2_score,
      previous_winner_team_id: match.winner_team_id,
      previous_forfeit_team_id: match.forfeit_team_id,
    },
  });

  const warnings: string[] = [];
  if (wasFinalized && hadPropagation) {
    warnings.push(
      'Le match avait propage un winner dans le bracket. Les matchs suivants ne sont PAS reset automatiquement : verifie-les manuellement.'
    );
  }

  return res.status(200).json({
    success: true,
    matchId,
    previousStatus: match.status,
    ...(warnings.length > 0 ? { warnings } : {}),
  });
}

export default withBotRoute(handler, {
  methods: ['POST'],
  rateLimit: {
    max: 20,
    key: 'bot-match-reset',
    perActor: { max: 5, windowMs: 60_000 },
  },
  idempotent: true,
  bodySchema: resetBodySchema,
  querySchema: resetQuerySchema,
});
