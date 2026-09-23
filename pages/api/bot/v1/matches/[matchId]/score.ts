// POST /api/bot/v1/matches/[matchId]/score
//
// LA SAISIE DE SCORE PAR LE STAFF, depuis Discord (ou le chat Twitch relayé
// par le cockpit). Le score S'IMPOSE : le match est finalisé, le bracket
// propagé, le résultat annoncé — dans la foulée.
//
// À NE PAS CONFONDRE AVEC `/report`, qui est la voie des CAPITAINES. Là-bas
// deux reports doivent concorder, et un désaccord met le match en litige.
// C'est le bon mécanisme entre équipes, et c'est exactement ce qu'on veut
// court-circuiter ici : quand personne ne reporte, ou qu'un litige traîne
// pendant la diffusion, il faut pouvoir trancher.
//
// D'OÙ LE JOURNAL STAFF, systématique. Un score autoritaire ne laisse aucune
// trace naturelle — le match finit « terminé », comme s'il s'était conclu tout
// seul. Sans entrée au journal, personne ne saurait plus tard qui a tranché ni
// quand, et une erreur de saisie serait indiscernable d'un vrai résultat.
//
// LE CONTRÔLE DE FORMAT RESTE ACTIF PAR DÉFAUT. Un 4-0 sur un Bo3 est refusé,
// parce que c'est presque toujours une faute de frappe. Mais une série
// abandonnée en cours produit un score réel qui ne respecte pas le format :
// `allowIncompleteSeries` permet de le saisir, en le disant.
//
// Auth : x-api-key + `actorDiscordUserId` d'un staff admin/owner, remonté via
// `user_discord_links`. Un rôle `caster` est refusé.

import type { z } from 'zod';
import type { NextApiResponse } from 'next';

import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute, type BotTenantRequest } from '@/utils/botAuth';
import { requireBotStaff, logBotStaffAction } from '@/utils/botActor';
import { applyMatchScore } from '@/utils/matches/applyScore';
import {
  invalidScoreForFormatMessage,
  isScoreValidForBestOf,
  resolveSeriesBestOf,
} from '@/utils/matches/scoreReports';
import { logger } from '@/utils/logger';
import { scoreBodySchema } from '@/lib/apiContracts/bot/matches/[matchId]/score';
import { scoreQuerySchema } from '@/lib/apiContracts/bot/matches/[matchId]/score.query';

async function handler(req: BotTenantRequest, res: NextApiResponse) {
  const { matchId } = req.botQuery as z.infer<typeof scoreQuerySchema>;
  const tenantId = req.botContext.tenantId;

  const body = (req.body ?? {}) as Record<string, unknown>;
  const actor = await requireBotStaff(req, res, body);
  if (!actor) return;

  const { team1Score, team2Score, allowIncompleteSeries } =
    req.botInput as z.infer<typeof scoreBodySchema>;

  // Lecture d'abord, pour rendre un message métier lisible sur Discord plutôt
  // que l'erreur générique d'`applyMatchScore`. Le bot affiche `error` TEL
  // QUEL : ces phrases sont écrites pour être lues dans un salon.
  const { data: match, error: mErr } = await supabaseAdmin
    .from('matches')
    .select('id, status, team1_id, team2_id, is_bye, best_of, match_format')
    .eq('tenant_id', tenantId)
    .eq('id', matchId)
    .maybeSingle();

  if (mErr) {
    logger.error('[bot/match/score] lookup error', mErr);
    return res.status(500).json({ error: 'Erreur de chargement du match' });
  }
  if (!match) return res.status(404).json({ error: 'Match introuvable' });

  if (match.is_bye) {
    return res
      .status(400)
      .json({ error: 'Un match bye n’a pas de score à saisir.' });
  }
  if (!match.team1_id || !match.team2_id) {
    return res
      .status(400)
      .json({ error: 'Ce match n’a pas encore ses deux équipes.' });
  }
  if (team1Score === team2Score) {
    // Aucun format de la Cup n'admet l'égalité, et un 2-2 saisi sur un Bo5 est
    // toujours une erreur — mieux vaut le dire que de finaliser sans vainqueur.
    return res
      .status(400)
      .json({ error: 'Un match ne peut pas se terminer sur une égalité.' });
  }

  // Le best-of se déduit de DEUX colonnes : `best_of` quand elle est posée,
  // sinon le `match_format` (`bo3`, `single_map`…). Même résolution que la
  // voie capitaine, pour que les deux refusent exactement les mêmes scores.
  const bestOf = resolveSeriesBestOf(match.best_of, match.match_format);

  if (
    !allowIncompleteSeries &&
    bestOf !== null &&
    !isScoreValidForBestOf(team1Score, team2Score, bestOf)
  ) {
    return res.status(400).json({
      error: `${invalidScoreForFormatMessage(bestOf)} Vérifie le score saisi.`,
      code: 'INVALID_SCORE_FOR_FORMAT',
    });
  }

  const winnerTeamId =
    team1Score > team2Score
      ? (match.team1_id as string)
      : (match.team2_id as string);

  try {
    const result = await applyMatchScore({
      tenantId,
      matchId,
      team1Score,
      team2Score,
      winnerTeamId,
      staffId: actor.staffId,
      propagateBracket: true,
      allowIncompleteSeries: !!allowIncompleteSeries,
    });

    // La trace, sans laquelle un score autoritaire est indiscernable d'un
    // résultat venu des équipes.
    await logBotStaffAction({
      staffId: actor.staffId,
      // `update_match` + `action_type`, comme `reset.ts` : la convention du
      // dépôt, qui garde le journal filtrable sans gonfler l'union des actions.
      action: 'update_match',
      entity_type: 'match',
      entity_id: matchId,
      payload: {
        action_type: 'staff_score',
        team1Score,
        team2Score,
        winnerTeamId,
        previousStatus: match.status,
        allowIncompleteSeries: !!allowIncompleteSeries,
      },
    });

    const updated = (result.match ?? {}) as {
      team1_score?: number | null;
      team2_score?: number | null;
      status?: string | null;
    };

    return res.status(200).json({
      success: true,
      matchId,
      team1Score: updated.team1_score ?? team1Score,
      team2Score: updated.team2_score ?? team2Score,
      winnerTeamId: result.winnerTeamId ?? winnerTeamId,
      status: updated.status ?? null,
      /** Vrai quand le match était en litige : le staff vient de trancher. */
      resolvedDispute: match.status === 'disputed',
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error('[bot/match/score] applyMatchScore error', e);
    return res.status(400).json({ error: msg, code: 'APPLY_FAILED' });
  }
}

export default withBotRoute(handler, {
  methods: ['POST'],
  rateLimit: {
    // Bien plus serré que le vote : une saisie de score est un geste rare et
    // lourd de conséquences. Dix par minute et par personne laissent de la
    // marge pour corriger une erreur, pas pour marteler.
    max: 120,
    key: 'bot-match-score',
    perActor: {
      max: 10,
      windowMs: 60_000,
      actorField: 'actorDiscordUserId',
    },
  },
  bodySchema: scoreBodySchema,
  querySchema: scoreQuerySchema,
});
