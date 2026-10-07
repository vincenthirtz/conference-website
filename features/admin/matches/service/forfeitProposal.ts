// features/admin/matches/service/forfeitProposal.ts — proposition de forfait
// d'un match, vue staff : la lire, la confirmer ou la refuser depuis la fiche
// admin. Seul moyen de trancher tant que le bot ne propose pas les boutons du
// DM, et le même cœur que lui (utils/matches/forfeitProposalResolve.ts) : une
// décision prise ici apparaît côté Discord par `match.forfeit_resolved`.

import { LegacyAdminError } from '@/utils/admin/errors';
import type { ServiceContext } from '@/utils/admin/serviceContext';
import {
  readForfeitProposal,
  type ForfeitProposal,
} from '@/utils/matches/forfeitProposal';
import {
  RESOLVE_FORFEIT_PROPOSAL_HTTP,
  resolveForfeitProposal,
  type ForfeitProposalDecision,
  type ResolvedMatchState,
} from '@/utils/matches/forfeitProposalResolve';
import type { Audited } from '../../_shared/audited';
import { withInternalError } from './internal';

const LABEL = '[/api/admin/matches/[matchId]/forfeit-proposal] error';

export type ForfeitProposalView = {
  /** `false` tant que la migration des colonnes n'est pas appliquée. */
  available: boolean;
  proposal: ForfeitProposal | null;
};

export async function getForfeitProposal(
  ctx: ServiceContext,
  matchId: string
): Promise<ForfeitProposalView> {
  const read = await withInternalError(ctx, LABEL, () =>
    readForfeitProposal(ctx.tenantId, matchId)
  );
  if (read.ok) return { available: true, proposal: read.proposal };
  if (read.reason === 'not_found') {
    throw new LegacyAdminError(404, 'Match not found');
  }
  if (read.reason === 'unavailable') {
    return { available: false, proposal: null };
  }
  throw new LegacyAdminError(500, 'Internal server error');
}

export async function decideForfeitProposal(
  ctx: ServiceContext,
  matchId: string,
  decision: ForfeitProposalDecision
): Promise<
  Audited<{
    success: true;
    matchId: string;
    outcome: 'confirmed' | 'declined';
    proposal: ForfeitProposal;
    match: ResolvedMatchState | null;
  }>
> {
  const staffId = ctx.actor.kind === 'staff' ? ctx.actor.staffId : null;
  const result = await withInternalError(ctx, LABEL, () =>
    resolveForfeitProposal({
      tenantId: ctx.tenantId,
      matchId,
      decision,
      staffId,
    })
  );

  if (!result.ok) {
    throw new LegacyAdminError(
      RESOLVE_FORFEIT_PROPOSAL_HTTP[result.code],
      result.error,
      {
        code: result.code,
        extra: {
          ...(result.proposal !== undefined
            ? { proposal: result.proposal }
            : {}),
          ...(result.matchStatus !== undefined
            ? { matchStatus: result.matchStatus }
            : {}),
        },
      }
    );
  }

  return {
    result: {
      success: true,
      matchId,
      outcome: result.outcome,
      proposal: result.proposal,
      match: result.match,
    },
    audit: {
      entity_type: 'match',
      entity_id: matchId,
      tournament_id: result.tournamentId,
      payload: {
        subject: 'forfeit_proposal',
        decision: result.outcome,
        absent_team_id: result.proposal.absentTeamId,
      },
    },
  };
}
