// features/admin/stages/service/disqualify.ts — disqualifier une équipe d'une
// phase, ou la réintégrer.
//
// Deux modes (utils/stages/disqualification pour l'effet au classement) :
//   - `forfeit` : chaque match restant passe en forfait (`applyMatchScore`
//     avec `forfeitTeamId`) — score 0 vs victoires requises, pronostics
//     annulés, événements bot `match.finished` / `team.forfeit`, bracket
//     propagé, avancement auto. Les matchs déjà joués comptent normalement.
//   - `annul`   : chaque match restant est annulé (statut `cancelled`, scores
//     vidés, note), ses pronostics réglés en « void ». Au classement, TOUS
//     les matchs de l'équipe sont ignorés. Les matchs joués ne sont PAS
//     modifiés en base.
//
// ORDRE : la disqualification est posée AVANT de traiter les matchs. Le
// dernier forfait peut déclencher l'avancement automatique de la phase : il
// doit déjà voir l'équipe disqualifiée, sinon il pourrait la qualifier.
//
// ÉCHEC EN COURS DE ROUTE : traitement séquentiel, arrêt au premier match en
// erreur. La disqualification reste posée (c'est la décision du staff) et la
// réponse 201 dit exactement ce qui a été fait : `forfeited` / `cancelled`,
// `failed` (le match en erreur), `notProcessed` (les suivants), `complete:
// false`. Le journal reprend le même détail. Le staff termine à la main
// depuis la fiche des matchs — un second POST répondrait 409.
//
// Matchs en litige (`disputed`) : jamais touchés, listés dans `skipped` — le
// litige se résout par sa propre route. Idem pour un match dont l'adversaire
// n'est pas encore connu (forfait sans vainqueur possible).

import type { ServiceContext } from '@/utils/admin/serviceContext';
import { applyMatchScore } from '@/utils/matches/applyScore';
import { settleMatchPredictions } from '@/utils/predictions/settle';
import { invalidateStandingsCache } from '@/utils/stages/standingsCache';
import { parseDisqualificationMode } from '@/utils/stages/disqualification';
import { oneRelation, type Relation } from '@/utils/supabase/relation';
import type { Audited } from '../../_shared/audited';
import type {
  DisqualificationMode,
  DisqualifyMatchSummary,
  DisqualifyTeamResponse,
  ReinstateTeamResponse,
} from '../client';
import * as stages from '../repository/stages';
import * as matches from '../repository/matches';
import * as related from '../repository/related';
import { fail } from './common';
import { staffIdOf } from './seeding';

/** Statuts d'un match encore à jouer (traité par la disqualification). */
export const OPEN_MATCH_STATUSES = ['pending', 'ongoing', 'postponed'] as const;
/** Lus aussi pour être signalés, jamais modifiés. */
const READ_STATUSES = [...OPEN_MATCH_STATUSES, 'disputed'] as const;

type Skipped = DisqualifyTeamResponse['skipped'][number];

async function loadStage(ctx: ServiceContext, stageId: string) {
  const { row } = await stages.getStageCore(ctx.db, ctx.tenantId, stageId);
  if (!row) throw fail(404, 'Stage introuvable.');
  return row;
}

async function loadEntry(ctx: ServiceContext, stageId: string, teamId: string) {
  const { row, error } = await stages.stageTeamDisqualification(
    ctx.db,
    ctx.tenantId,
    stageId,
    teamId
  );
  if (error) {
    ctx.logger.error('[disqualify] lecture inscription', error);
    throw fail(500, "Lecture de l'inscription impossible.");
  }
  if (!row) {
    throw fail(
      404,
      "Cette équipe n'est pas inscrite à la phase.",
      'TEAM_NOT_IN_STAGE'
    );
  }
  const team = oneRelation(
    row.team as Relation<{ id: string; name: string | null }>
  );
  return { row, teamName: team?.name ?? null };
}

type MatchForSummary = {
  id: string;
  team1_id: string | null;
  team2_id: string | null;
  round_name?: string | null;
  scheduled_at: string | null;
};

/**
 * Résumé (équipes, ronde, date) des matchs cités dans la réponse. Une seule
 * lecture des noms ; un échec ne casse pas la réponse — la disqualification
 * est déjà faite — il laisse des noms `null`.
 */
async function summarizeMatches(
  ctx: ServiceContext,
  rows: MatchForSummary[],
  ids: Set<string>
): Promise<Record<string, DisqualifyMatchSummary>> {
  const cited = rows.filter((r) => ids.has(r.id));
  const teamIds = [
    ...new Set(cited.flatMap((r) => [r.team1_id, r.team2_id]).filter(Boolean)),
  ] as string[];
  const names = new Map<string, string | null>();
  if (teamIds.length > 0) {
    try {
      for (const t of await related.teamNames(ctx.db, ctx.tenantId, teamIds)) {
        names.set(t.id, t.name ?? t.short_name ?? null);
      }
    } catch (err) {
      ctx.logger.error('[disqualify] noms des équipes illisibles', err);
    }
  }
  const nameOf = (id: string | null) => (id ? (names.get(id) ?? null) : null);
  const out: Record<string, DisqualifyMatchSummary> = {};
  for (const r of cited) {
    out[r.id] = {
      team1Name: nameOf(r.team1_id),
      team2Name: nameOf(r.team2_id),
      roundName: r.round_name ?? null,
      scheduledAt: r.scheduled_at ?? null,
    };
  }
  return out;
}

function cancelNote(existing: string | null, teamName: string | null) {
  const line = `Annulé : ${teamName ?? 'équipe'} disqualifiée`;
  return existing?.trim() ? `${existing.trim()}\n${line}` : line;
}

/* ------------------------------ disqualifier ----------------------------- */

export async function disqualifyStageTeam(
  ctx: ServiceContext,
  stageId: string,
  input: { teamId: string; mode: DisqualificationMode; reason: string }
): Promise<Audited<DisqualifyTeamResponse>> {
  const { teamId, mode, reason } = input;
  const stage = await loadStage(ctx, stageId);
  const { row, teamName } = await loadEntry(ctx, stageId, teamId);

  if (row.disqualified_at) {
    throw fail(
      409,
      'Cette équipe est déjà disqualifiée de la phase.',
      'ALREADY_DISQUALIFIED',
      {
        disqualifiedAt: row.disqualified_at,
        mode: parseDisqualificationMode(row.disqualification_mode),
      }
    );
  }

  // Un tournoi clos refuse toute écriture de score (applyMatchScore aussi) :
  // on refuse AVANT d'écrire quoi que ce soit.
  const tournament = await related.tournamentStatus(
    ctx.db,
    ctx.tenantId,
    stage.tournament_id
  );
  if (tournament?.status === 'completed') {
    throw fail(
      409,
      'Le tournoi est terminé : réouvrez-le avant de disqualifier une équipe.',
      'TOURNAMENT_COMPLETED'
    );
  }

  const { rows: openRows, error: matchesErr } = await matches.teamStageMatches(
    ctx.db,
    ctx.tenantId,
    stageId,
    teamId,
    READ_STATUSES
  );
  if (matchesErr) {
    ctx.logger.error('[disqualify] lecture matchs', matchesErr);
    throw fail(500, 'Lecture des matchs de la phase impossible.');
  }

  // 1) La décision d'abord (cf. ORDRE en tête de fichier). Écriture
  //    conditionnelle : un second staff au même instant lit 0 ligne → 409.
  const staffId = staffIdOf(ctx);
  const disqualifiedAt = new Date().toISOString();
  const written = await stages.setStageTeamDisqualification(
    ctx.db,
    ctx.tenantId,
    stageId,
    teamId,
    {
      disqualified_at: disqualifiedAt,
      disqualification_mode: mode,
      disqualification_reason: reason,
      disqualified_by: staffId,
    },
    true
  );
  if (written.error) {
    ctx.logger.error('[disqualify] écriture', written.error);
    throw fail(500, 'Échec de la disqualification.');
  }
  if (written.count === 0) {
    throw fail(
      409,
      'Cette équipe est déjà disqualifiée de la phase.',
      'ALREADY_DISQUALIFIED'
    );
  }
  invalidateStandingsCache(stageId);

  // 2) Les matchs restants, un par un.
  const forfeited: string[] = [];
  const cancelled: string[] = [];
  const skipped: Skipped[] = [];
  let failed: DisqualifyTeamResponse['failed'] = null;
  const notProcessed: string[] = [];

  for (const m of openRows ?? []) {
    if (failed) {
      notProcessed.push(m.id);
      continue;
    }
    if (m.status === 'disputed') {
      skipped.push({ id: m.id, reason: 'disputed' });
      continue;
    }
    try {
      if (mode === 'forfeit') {
        const opponent = m.team1_id === teamId ? m.team2_id : m.team1_id;
        if (!opponent) {
          skipped.push({ id: m.id, reason: 'no_opponent' });
          continue;
        }
        await applyMatchScore({
          tenantId: ctx.tenantId,
          matchId: m.id,
          forfeitTeamId: teamId,
          staffId,
        });
        forfeited.push(m.id);
      } else {
        const res = await matches.cancelOpenMatch(
          ctx.db,
          ctx.tenantId,
          m.id,
          cancelNote(m.notes, teamName),
          OPEN_MATCH_STATUSES
        );
        if (res.error) throw new Error(res.error.message);
        if (res.count === 0) {
          // Joué ou mis en litige entre la lecture et l'écriture.
          skipped.push({ id: m.id, reason: 'status_changed' });
          continue;
        }
        cancelled.push(m.id);
        // Pronostics ouverts → « void ». Un échec ici n'annule rien : le
        // règlement est rejouable (cron / prochaine lecture).
        const settled = await settleMatchPredictions(ctx.tenantId, m.id);
        if (!settled.ok && settled.reason === 'failed') {
          ctx.logger.error('[disqualify] pronostics non réglés', m.id);
        }
      }
    } catch (err) {
      failed = {
        id: m.id,
        error: err instanceof Error ? err.message : String(err),
      };
      ctx.logger.error('[disqualify] match en échec', m.id, err);
    }
  }

  // Scores / statuts changés : le classement se recalcule à la lecture.
  invalidateStandingsCache(stageId);

  const citedIds = new Set([
    ...forfeited,
    ...cancelled,
    ...skipped.map((s) => s.id),
    ...(failed ? [failed.id] : []),
    ...notProcessed,
  ]);
  const matchSummaries = await summarizeMatches(ctx, openRows ?? [], citedIds);

  const result: DisqualifyTeamResponse = {
    mode,
    teamId,
    teamName,
    disqualifiedAt,
    forfeited,
    cancelled,
    skipped,
    failed,
    notProcessed,
    complete: failed === null,
    matches: matchSummaries,
  };

  return {
    result,
    audit: {
      entity_type: 'stage',
      entity_id: stageId,
      tournament_id: stage.tournament_id,
      payload: {
        team_id: teamId,
        team_name: teamName,
        mode,
        reason,
        forfeited_match_ids: forfeited,
        cancelled_match_ids: cancelled,
        skipped,
        failed,
        not_processed_match_ids: notProcessed,
        complete: result.complete,
      },
    },
  };
}

/* ------------------------------ réintégrer ------------------------------- */

export async function reinstateStageTeam(
  ctx: ServiceContext,
  stageId: string,
  teamId: string | undefined
): Promise<Audited<ReinstateTeamResponse>> {
  if (!teamId) throw fail(400, 'team_id requis (query ou corps).');
  const stage = await loadStage(ctx, stageId);
  const { row, teamName } = await loadEntry(ctx, stageId, teamId);

  if (!row.disqualified_at) {
    throw fail(
      409,
      "Cette équipe n'est pas disqualifiée de la phase.",
      'NOT_DISQUALIFIED'
    );
  }

  const written = await stages.setStageTeamDisqualification(
    ctx.db,
    ctx.tenantId,
    stageId,
    teamId,
    {
      disqualified_at: null,
      disqualification_mode: null,
      disqualification_reason: null,
      disqualified_by: null,
    }
  );
  if (written.error) {
    ctx.logger.error('[disqualify] réintégration', written.error);
    throw fail(500, 'Échec de la réintégration.');
  }
  invalidateStandingsCache(stageId);

  // Rien n'est restauré : on dit combien de matchs restent en l'état
  // (forfaits de l'équipe et matchs annulés de l'équipe dans la phase).
  const { rows } = await matches.teamStageMatches(
    ctx.db,
    ctx.tenantId,
    stageId,
    teamId,
    ['walkover', 'cancelled']
  );
  const matchesNotRestored = (rows ?? []).filter(
    (m) => m.status === 'cancelled' || m.forfeit_team_id === teamId
  ).length;

  return {
    result: { teamId, reinstated: true, matchesNotRestored },
    audit: {
      entity_type: 'stage',
      entity_id: stageId,
      tournament_id: stage.tournament_id,
      payload: {
        team_id: teamId,
        team_name: teamName,
        previous_mode: parseDisqualificationMode(row.disqualification_mode),
        previous_reason: row.disqualification_reason ?? null,
        disqualified_at: row.disqualified_at,
        matches_not_restored: matchesNotRestored,
      },
    },
  };
}
