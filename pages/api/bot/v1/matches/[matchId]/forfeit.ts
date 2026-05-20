// POST /api/bot/v1/matches/[matchId]/forfeit
//
// Commande /forfait (admin) : marque une equipe en forfait sur un match.
// Reutilise applyMatchScore qui :
//  - calcule auto les scores (0 cote forfait, requiredWins cote vainqueur
//    selon match_format)
//  - met status='walkover'
//  - propage le winner dans le bracket (next_match_win_id / next_match_lose_id)
//  - logue dans staff_logs
//
// Auth : x-api-key + actorDiscordUserId staff admin/owner.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute } from '@/utils/botAuth';
import { requireBotStaff } from '@/utils/botActor';
import { isValidUUID } from '@/utils/apiHelpers';
import { applyMatchScore } from '@/utils/matches/applyScore';
import { logger } from '@/utils/logger';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const raw = req.query.matchId;
  const matchId = Array.isArray(raw) ? raw[0] : raw;
  if (!matchId || !isValidUUID(matchId)) {
    return res.status(400).json({ error: 'matchId invalide' });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;

  const actor = await requireBotStaff(req, res, body);
  if (!actor) return;

  const forfeitTeamId =
    typeof body.forfeitTeamId === 'string' ? body.forfeitTeamId.trim() : '';
  if (!isValidUUID(forfeitTeamId)) {
    return res.status(400).json({ error: 'forfeitTeamId invalide' });
  }

  // Lecture rapide pour donner un message d'erreur metier propre avant
  // applyMatchScore — sinon le helper renvoie un message generique.
  const { data: match, error: mErr } = await supabaseAdmin
    .from('matches')
    .select('id, status, team1_id, team2_id, is_bye')
    .eq('tenant_id', req.botContext!.tenantId)
    .eq('id', matchId)
    .maybeSingle();
  if (mErr) {
    logger.error('[bot/match/forfeit] lookup error', mErr);
    return res.status(500).json({ error: 'Erreur de chargement du match' });
  }
  if (!match) {
    return res.status(404).json({ error: 'Match introuvable' });
  }
  if (match.is_bye) {
    return res.status(400).json({ error: 'Un match bye ne peut pas être marqué forfait.' });
  }
  if (forfeitTeamId !== match.team1_id && forfeitTeamId !== match.team2_id) {
    return res
      .status(400)
      .json({ error: "L'équipe forfait ne participe pas à ce match." });
  }

  try {
    const result = await applyMatchScore({
      tenantId: req.botContext!.tenantId,
      matchId,
      forfeitTeamId,
      staffId: actor.staffId,
      propagateBracket: true,
    });
    const updatedMatch = (result.match ?? {}) as {
      team1_score?: number | null;
      team2_score?: number | null;
      status?: string | null;
    };
    return res.status(200).json({
      success: true,
      matchId,
      forfeitTeamId,
      winnerTeamId: result.winnerTeamId,
      team1Score: updatedMatch.team1_score ?? null,
      team2Score: updatedMatch.team2_score ?? null,
      status: updatedMatch.status ?? null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error('[bot/match/forfeit] applyMatchScore error', e);
    return res.status(400).json({ error: msg, code: 'APPLY_FAILED' });
  }
}

export default withBotRoute(handler, {
  methods: ['POST'],
  rateLimit: {
    max: 20,
    key: 'bot-match-forfeit',
    perActor: { max: 5, windowMs: 60_000 },
  },
  idempotent: true,
});
