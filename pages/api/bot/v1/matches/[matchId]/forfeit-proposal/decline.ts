// POST /api/bot/v1/matches/[matchId]/forfeit-proposal/decline
//
// Bouton du DM « proposition de forfait » (event `match.forfeit_proposed`).
// REFUSER : la proposition passe `declined`, rien ne bouge sur le match
// (score, statut, bracket).
//
// Auth : x-api-key + actorDiscordUserId admin/owner DU TENANT (rôle effectif,
// cf. requireBotTenantAdmin) — sinon 403.
// Proposition plus en attente (déjà tranchée, écrasée par une saisie staff) :
// 409 FORFEIT_PROPOSAL_NOT_PENDING avec l'état courant, pour éditer le DM.
// Cœur partagé avec la fiche admin : utils/matches/forfeitProposalResolve.ts.

import type * as z from 'zod';
import type { NextApiResponse } from 'next';
import { withBotRoute, type BotTenantRequest } from '@/utils/botAuth';
import { logBotStaffAction, requireBotTenantAdmin } from '@/utils/botActor';
import {
  RESOLVE_FORFEIT_PROPOSAL_HTTP,
  resolveForfeitProposal,
} from '@/utils/matches/forfeitProposalResolve';
import { logger } from '@/utils/logger';
import { forfeitProposalBodySchema } from '@/lib/apiContracts/bot/matches/[matchId]/forfeit-proposal';
import { forfeitProposalQuerySchema } from '@/lib/apiContracts/bot/matches/[matchId]/forfeit-proposal.query';

async function handler(req: BotTenantRequest, res: NextApiResponse) {
  const { matchId } = req.botQuery as z.infer<
    typeof forfeitProposalQuerySchema
  >;
  const tenantId = req.botContext.tenantId;

  const actor = await requireBotTenantAdmin(
    req,
    res,
    (req.body ?? {}) as Record<string, unknown>,
    tenantId
  );
  if (!actor) return;

  let result: Awaited<ReturnType<typeof resolveForfeitProposal>>;
  try {
    result = await resolveForfeitProposal({
      tenantId,
      matchId,
      decision: 'decline',
      staffId: actor.staffId,
      discordUserId: actor.discordUserId,
    });
  } catch (e) {
    logger.error('[bot/match/forfeit-proposal/decline] error', e);
    return res.status(500).json({ error: 'Erreur serveur' });
  }

  if (!result.ok) {
    return res.status(RESOLVE_FORFEIT_PROPOSAL_HTTP[result.code]).json({
      error: result.error,
      code: result.code,
      ...(result.proposal !== undefined ? { proposal: result.proposal } : {}),
      ...(result.matchStatus !== undefined
        ? { matchStatus: result.matchStatus }
        : {}),
    });
  }

  await logBotStaffAction({
    staffId: actor.staffId,
    action: 'update_match',
    entity_type: 'match',
    entity_id: matchId,
    tournament_id: result.tournamentId,
    payload: {
      subject: 'forfeit_proposal',
      decision: 'declined',
      absent_team_id: result.proposal.absentTeamId,
    },
  });

  return res.status(200).json({
    success: true,
    matchId,
    outcome: result.outcome,
    proposal: result.proposal,
    match: result.match,
  });
}

export default withBotRoute(handler, {
  methods: ['POST'],
  rateLimit: {
    max: 20,
    key: 'bot-match-forfeit-proposal-decline',
    perActor: { max: 5, windowMs: 60_000 },
  },
  idempotent: true,
  bodySchema: forfeitProposalBodySchema,
  querySchema: forfeitProposalQuerySchema,
});
