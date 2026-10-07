// utils/matches/forfeitProposalResolve.ts
//
// Trancher une proposition de forfait : CONFIRMER (le forfait est appliqué,
// exactement comme le faisait le cron avant le 2026-10-07) ou REFUSER (rien ne
// bouge sur le match). Cœur partagé par les boutons du DM Discord
// (/api/bot/v1/matches/:matchId/forfeit-proposal/{confirm,decline}) et la fiche
// admin du match (/api/admin/matches/:matchId/forfeit-proposal).
//
// Concurrence : chaque transition est une écriture CONDITIONNELLE
// `forfeit_proposal_status = 'pending'`. Deux admins qui cliquent en même
// temps : un seul gagne, l'autre reçoit FORFEIT_PROPOSAL_NOT_PENDING avec
// l'état courant.
//
// Module à part de ./forfeitProposal.ts parce qu'il dépend d'applyScore (via
// utils/checkin.ts), qui dépend lui-même de forfeitProposal (écrasement).
//
// La journalisation staff est laissée aux appelants (bot : logBotStaffAction ;
// admin : `audited`), qui savent par quel canal la décision est venue.

import { supabaseAdmin } from '../supabase';
import { logger } from '../logger';
import { applyNoShowForfeit, loadCheckinMatch } from '../checkin';
import {
  COL_RESOLVED_AT,
  COL_RESOLVED_BY,
  COL_STATUS,
  emitForfeitResolved,
  readForfeitProposal,
  type ForfeitProposal,
} from './forfeitProposal';

export type ForfeitProposalDecision = 'confirm' | 'decline';

export type ResolveForfeitProposalErrorCode =
  | 'MATCH_NOT_FOUND'
  | 'FORFEIT_PROPOSAL_NOT_FOUND'
  | 'FORFEIT_PROPOSAL_NOT_PENDING'
  | 'FORFEIT_PROPOSALS_UNAVAILABLE'
  | 'APPLY_FAILED';

/** Statut HTTP de chaque code, partagé bot / admin. */
export const RESOLVE_FORFEIT_PROPOSAL_HTTP: Record<
  ResolveForfeitProposalErrorCode,
  number
> = {
  MATCH_NOT_FOUND: 404,
  FORFEIT_PROPOSAL_NOT_FOUND: 404,
  FORFEIT_PROPOSAL_NOT_PENDING: 409,
  FORFEIT_PROPOSALS_UNAVAILABLE: 503,
  APPLY_FAILED: 400,
};

export type ResolvedMatchState = {
  status: string | null;
  team1Score: number | null;
  team2Score: number | null;
  winnerTeamId: string | null;
};

export type ResolveForfeitProposalResult =
  | {
      ok: true;
      outcome: 'confirmed' | 'declined';
      proposal: ForfeitProposal;
      tournamentId: string | null;
      /** État du match après le forfait ; `null` sur un refus (match inchangé). */
      match: ResolvedMatchState | null;
    }
  | {
      ok: false;
      code: ResolveForfeitProposalErrorCode;
      error: string;
      /** État courant de la proposition (409) — de quoi mettre le DM à jour. */
      proposal?: ForfeitProposal | null;
      matchStatus?: string | null;
    };

/** Statuts depuis lesquels un forfait peut encore être appliqué. */
const FORFEITABLE_STATUSES = new Set(['pending', 'ongoing', 'postponed']);

const NOT_PENDING_MESSAGE =
  "Cette proposition de forfait n'est plus en attente.";

async function transition(
  tenantId: string,
  matchId: string,
  from: string,
  to: string,
  staffId: string | null
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('matches')
    .update({
      [COL_STATUS]: to,
      [COL_RESOLVED_BY]: to === 'pending' ? null : staffId,
      [COL_RESOLVED_AT]: to === 'pending' ? null : new Date().toISOString(),
    })
    .eq('tenant_id', tenantId)
    .eq('id', matchId)
    .eq(COL_STATUS, from)
    .select('id')
    .maybeSingle();
  if (error) throw new Error(error.message ?? String(error));
  return !!data;
}

async function notPending(
  tenantId: string,
  matchId: string,
  matchStatus: string | null
): Promise<ResolveForfeitProposalResult> {
  const current = await readForfeitProposal(tenantId, matchId);
  return {
    ok: false,
    code: 'FORFEIT_PROPOSAL_NOT_PENDING',
    error: NOT_PENDING_MESSAGE,
    proposal: current.ok ? current.proposal : null,
    matchStatus,
  };
}

/**
 * Confirme ou refuse la proposition de forfait d'un match.
 *
 * - `confirm` : `pending` → `confirmed`, puis forfait appliqué
 *   (`applyNoShowForfeit` : requiredWins-0, `walkover`, bracket, notifications).
 *   Si l'application échoue, la proposition REDEVIENT `pending` (APPLY_FAILED).
 *   Si le match est déjà clos (score saisi par les équipes, annulé…), la
 *   proposition passe `overridden` et la réponse est NOT_PENDING : appliquer un
 *   forfait écraserait un résultat existant.
 * - `decline` : `pending` → `declined`. Rien d'autre.
 *
 * Émet `match.forfeit_resolved` sur chaque transition aboutie.
 */
export async function resolveForfeitProposal(opts: {
  tenantId: string;
  matchId: string;
  decision: ForfeitProposalDecision;
  staffId: string | null;
  discordUserId?: string | null;
}): Promise<ResolveForfeitProposalResult> {
  const { tenantId, matchId, decision, staffId } = opts;

  const read = await readForfeitProposal(tenantId, matchId);
  if (!read.ok) {
    if (read.reason === 'not_found') {
      return { ok: false, code: 'MATCH_NOT_FOUND', error: 'Match introuvable' };
    }
    if (read.reason === 'unavailable') {
      return {
        ok: false,
        code: 'FORFEIT_PROPOSALS_UNAVAILABLE',
        error:
          'Propositions de forfait indisponibles (migration non appliquée).',
      };
    }
    throw new Error('Lecture de la proposition de forfait impossible');
  }
  const proposal = read.proposal;
  if (!proposal) {
    return {
      ok: false,
      code: 'FORFEIT_PROPOSAL_NOT_FOUND',
      error: 'Aucune proposition de forfait sur ce match.',
    };
  }

  const match = await loadCheckinMatch(tenantId, matchId);
  if (!match) {
    return { ok: false, code: 'MATCH_NOT_FOUND', error: 'Match introuvable' };
  }
  if (proposal.status !== 'pending') {
    return {
      ok: false,
      code: 'FORFEIT_PROPOSAL_NOT_PENDING',
      error: NOT_PENDING_MESSAGE,
      proposal,
      matchStatus: match.status ?? null,
    };
  }

  if (decision === 'decline') {
    if (
      !(await transition(tenantId, matchId, 'pending', 'declined', staffId))
    ) {
      return notPending(tenantId, matchId, match.status ?? null);
    }
    await emitForfeitResolved({
      tenantId,
      matchId,
      outcome: 'declined',
      staffId,
      discordUserId: opts.discordUserId ?? null,
    });
    const after = await readForfeitProposal(tenantId, matchId);
    return {
      ok: true,
      outcome: 'declined',
      proposal: (after.ok && after.proposal) || {
        ...proposal,
        status: 'declined',
      },
      tournamentId: match.tournament_id ?? null,
      match: null,
    };
  }

  // Confirmer sur un match déjà clos écraserait un résultat : la proposition
  // est caduque.
  if (!FORFEITABLE_STATUSES.has(match.status)) {
    if (await transition(tenantId, matchId, 'pending', 'overridden', null)) {
      await emitForfeitResolved({
        tenantId,
        matchId,
        outcome: 'overridden',
        staffId: null,
      });
    }
    return notPending(tenantId, matchId, match.status ?? null);
  }

  const absentTeamId = proposal.absentTeamId;
  if (!absentTeamId) {
    return {
      ok: false,
      code: 'APPLY_FAILED',
      error: "L'équipe absente de la proposition n'existe plus.",
    };
  }

  if (!(await transition(tenantId, matchId, 'pending', 'confirmed', staffId))) {
    return notPending(tenantId, matchId, match.status ?? null);
  }

  let applied: Awaited<ReturnType<typeof applyNoShowForfeit>>;
  try {
    applied = await applyNoShowForfeit(match, absentTeamId, staffId);
  } catch (e) {
    logger.error('[forfeitProposal] apply forfeit error', e);
    // Le forfait n'est pas passé : la proposition redevient tranchable.
    await transition(tenantId, matchId, 'confirmed', 'pending', null).catch(
      (re) => logger.error('[forfeitProposal] revert to pending failed', re)
    );
    return {
      ok: false,
      code: 'APPLY_FAILED',
      error: e instanceof Error ? e.message : String(e),
    };
  }

  await emitForfeitResolved({
    tenantId,
    matchId,
    outcome: 'confirmed',
    staffId,
    discordUserId: opts.discordUserId ?? null,
  });

  const updated = (applied.match ?? {}) as {
    status?: string | null;
    team1_score?: number | null;
    team2_score?: number | null;
  };
  const after = await readForfeitProposal(tenantId, matchId);
  return {
    ok: true,
    outcome: 'confirmed',
    proposal: (after.ok && after.proposal) || {
      ...proposal,
      status: 'confirmed',
    },
    tournamentId: match.tournament_id ?? null,
    match: {
      status: updated.status ?? null,
      team1Score: updated.team1_score ?? null,
      team2Score: updated.team2_score ?? null,
      winnerTeamId: applied.winnerTeamId ?? null,
    },
  };
}
