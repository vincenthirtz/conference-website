// features/admin/stages/service/seeding.ts — placement des équipes au round 1
// d'un bracket : depuis le classement d'une phase source (auto-seed), à la
// main (manual-seed), ou depuis les ratings + force du calendrier
// (rating-seed), avec leurs prévisualisations.
//
// Les moteurs purs restent où ils sont : utils/stages/autoSeed
// (computeProposedSeeding), utils/seeding/{ratingSeeding,strengthOfSchedule},
// utils/stages/standings, utils/bracket/snapshot. Ce service ne fait que
// lire, appeler et écrire — mêmes verrous et mêmes messages qu'à l'origine.

import type { ServiceContext } from '@/utils/admin/serviceContext';
import { isValidUUID } from '@/utils/apiHelpers';
import { computeStageStandings } from '@/utils/stages/standings';
import {
  computeProposedSeeding,
  type ProposedSlot,
  type SeedingPattern,
} from '@/utils/stages/autoSeed';
import {
  computeRatingSeeding,
  type SeedingMethod,
  type SeedingTeamInput,
} from '@/utils/seeding/ratingSeeding';
import {
  computeStrengthOfSchedule,
  type SoSMatch,
} from '@/utils/seeding/strengthOfSchedule';
import { createBracketSnapshot } from '@/utils/bracket/snapshot';
import type { Audited } from '../../_shared/audited';
import * as stages from '../repository/stages';
import * as matches from '../repository/matches';
import * as related from '../repository/related';
import { fail, isLockedStatus } from './common';

type Body = Record<string, unknown>;

type TeamLite = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
};

type SeededSlot = {
  matchId: string;
  slot: 1 | 2;
  teamId: string;
  seed: number | null;
};

/* ------------------------------- auto-seed ------------------------------ */

export async function autoSeed(
  ctx: ServiceContext,
  targetStageId: string,
  body: Body
): Promise<Audited<{ seeded: ProposedSlot[]; totalMatches: number }>> {
  const sourceStageId = body.sourceStageId;
  const seedingPattern = body.seedingPattern ?? 'standard';

  if (!sourceStageId || typeof sourceStageId !== 'string') {
    throw fail(400, 'sourceStageId is required');
  }

  const { row: targetStage, error: tgtErr } = await stages.getStageCore(
    ctx.db,
    ctx.tenantId,
    targetStageId
  );
  if (tgtErr || !targetStage) throw fail(404, 'Target stage not found');
  if (targetStage.stage_type !== 'bracket') {
    throw fail(400, 'Target stage must be a bracket stage');
  }

  const { row: sourceStage, error: srcErr } = await stages.getStageCore(
    ctx.db,
    ctx.tenantId,
    sourceStageId
  );
  if (srcErr || !sourceStage) throw fail(404, 'Source stage not found');
  if (sourceStage.tournament_id !== targetStage.tournament_id) {
    throw fail(400, 'Les deux stages doivent appartenir au meme tournoi.');
  }

  const { rows: bracketMatches, error: matchErr } =
    await matches.roundOneMatches(ctx.db, ctx.tenantId, targetStageId);
  if (matchErr) throw fail(500, 'Failed to fetch bracket matches');
  if (!bracketMatches || bracketMatches.length === 0) {
    throw fail(
      400,
      "Aucun match de round 1 dans le bracket cible. Generez le bracket d'abord."
    );
  }

  // Verrou AVANT le calcul du classement (coûteux) : échec rapide.
  const locked = bracketMatches.filter((m) => isLockedStatus(m.status));
  if (locked.length > 0) {
    throw fail(
      409,
      `Impossible de re-seed : ${locked.length} match(es) du round 1 sont déjà joué(s) ou en cours.`
    );
  }

  const standings = await computeStageStandings(
    ctx.tenantId,
    sourceStageId,
    sourceStage.stage_type || 'other'
  );
  if (standings.length === 0) {
    throw fail(400, 'Aucun classement disponible pour le stage source.');
  }

  // Snapshot avant mutation (rollback via …/snapshots). Best-effort.
  void createBracketSnapshot({
    stageId: targetStageId,
    reason: 'auto_seed',
    staffId: staffIdOf(ctx),
    tenantId: ctx.tenantId,
  }).catch((e) =>
    ctx.logger.error('auto-seed: createBracketSnapshot failed', e)
  );

  const updates = computeProposedSeeding({
    standings,
    bracketMatches: bracketMatches.map((m) => ({ matchId: m.id })),
    pattern: seedingPattern as SeedingPattern,
  });
  const teamsToSeed = standings.slice(0, bracketMatches.length * 2);

  for (const u of updates) {
    const { error } = await matches.setMatchSlot(
      ctx.db,
      ctx.tenantId,
      u.matchId,
      u.slot,
      u.teamId
    );
    if (error) ctx.logger.error('auto-seed update error:', error);
  }

  const { ids } = await stages.stageTeamIds(
    ctx.db,
    ctx.tenantId,
    targetStageId
  );
  const existingIds = new Set(ids);
  const newTeamInserts = teamsToSeed
    .filter((t) => !existingIds.has(t.teamId))
    .map((t) => ({
      tenant_id: ctx.tenantId,
      stage_id: targetStageId,
      team_id: t.teamId,
      seed: t.rank,
      is_substitute: false,
      notes: null,
    }));
  if (newTeamInserts.length > 0) {
    await stages.insertStageTeams(ctx.db, newTeamInserts);
  }

  return {
    result: { seeded: updates, totalMatches: bracketMatches.length },
    audit: {
      entity_type: 'stage',
      entity_id: targetStageId,
      tournament_id: targetStage.tournament_id,
      payload: {
        source_stage_id: sourceStageId,
        target_stage_id: targetStageId,
        seeding_pattern: seedingPattern,
        seeded_count: updates.length,
      },
    },
  };
}

/* ------------------------------ manual-seed ----------------------------- */

type Assignment = {
  matchId: string;
  slot: 1 | 2;
  teamId: string;
  seed?: number;
};

function parseAssignments(raw: unknown): Assignment[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw fail(400, 'assignments doit être un tableau non vide.');
  }
  const out: Assignment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      throw fail(400, 'assignments[] : object attendu.');
    }
    const a = item as Record<string, unknown>;
    if (typeof a.matchId !== 'string' || !isValidUUID(a.matchId)) {
      throw fail(400, `matchId invalide : ${String(a.matchId).slice(0, 40)}`);
    }
    if (typeof a.teamId !== 'string' || !isValidUUID(a.teamId)) {
      throw fail(400, `teamId invalide : ${String(a.teamId).slice(0, 40)}`);
    }
    if (a.slot !== 1 && a.slot !== 2) {
      throw fail(400, 'slot doit valoir 1 ou 2.');
    }
    const seed =
      typeof a.seed === 'number' && Number.isInteger(a.seed) && a.seed > 0
        ? a.seed
        : undefined;
    out.push({ matchId: a.matchId, slot: a.slot, teamId: a.teamId, seed });
  }

  const slotKey = new Set<string>();
  for (const a of out) {
    const k = `${a.matchId}:${a.slot}`;
    if (slotKey.has(k))
      throw fail(400, `Slot dupliqué dans assignments : ${k}.`);
    slotKey.add(k);
  }

  const teamCount = new Map<string, number>();
  for (const a of out)
    teamCount.set(a.teamId, (teamCount.get(a.teamId) ?? 0) + 1);
  const dupTeam = [...teamCount.entries()].find(([, n]) => n > 1);
  if (dupTeam)
    throw fail(400, `Équipe assignée plusieurs fois : ${dupTeam[0]}.`);

  return out;
}

export async function manualSeed(
  ctx: ServiceContext,
  targetStageId: string,
  body: Body
): Promise<Audited<{ seeded: SeededSlot[]; totalMatches: number }>> {
  const replaceExisting = body.replaceExisting === true;
  const assignments = parseAssignments(body.assignments);

  const { row: stage, error: stageErr } = await stages.getStageCore(
    ctx.db,
    ctx.tenantId,
    targetStageId
  );
  if (stageErr || !stage) throw fail(404, 'Stage cible introuvable.');
  if (stage.stage_type !== 'bracket') {
    throw fail(400, 'Le stage cible doit être un bracket.');
  }

  const matchIds = [...new Set(assignments.map((a) => a.matchId))];
  const { rows, error: matchErr } = await matches.matchesByIds(
    ctx.db,
    ctx.tenantId,
    matchIds
  );
  if (matchErr) {
    ctx.logger.error('[manual-seed] fetch matches error', matchErr);
    throw fail(500, 'Erreur lors du chargement des matchs.');
  }
  const matchById = new Map((rows ?? []).map((m) => [m.id, m]));
  for (const a of assignments) {
    const m = matchById.get(a.matchId);
    if (!m) throw fail(400, `Match inconnu : ${a.matchId}.`);
    if (m.stage_id !== targetStageId) {
      throw fail(400, `Match ${a.matchId} n'appartient pas au stage cible.`);
    }
    if (m.round_number !== 1) {
      throw fail(400, `Match ${a.matchId} n'est pas dans le round 1.`);
    }
  }

  const locked = (rows ?? []).filter((m) => isLockedStatus(m.status));
  if (locked.length > 0) {
    throw fail(
      409,
      `Impossible de re-seed : ${locked.length} match(es) déjà joué(s) ou en cours.`,
      'STAGE_LOCKED'
    );
  }

  if (!replaceExisting) {
    const conflicts: { matchId: string; slot: 1 | 2; currentTeamId: string }[] =
      [];
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
      throw fail(
        409,
        'Certains slots sont déjà remplis. Passer replaceExisting=true pour écraser.',
        'SLOT_CONFLICT',
        { conflicts }
      );
    }
  }

  const teamIds = [...new Set(assignments.map((a) => a.teamId))];
  const found = await related.existingTeamIds(ctx.db, ctx.tenantId, teamIds);
  if (found.error) {
    ctx.logger.error('[manual-seed] fetch teams error', found.error);
    throw fail(500, 'Erreur lors du chargement des équipes.');
  }
  const foundIds = new Set(found.ids);
  const missing = teamIds.filter((id) => !foundIds.has(id));
  if (missing.length > 0) {
    throw fail(400, `Équipes inconnues : ${missing.join(', ')}.`);
  }

  const seeded: SeededSlot[] = [];
  for (const a of assignments) {
    const { error } = await matches.setMatchSlot(
      ctx.db,
      ctx.tenantId,
      a.matchId,
      a.slot,
      a.teamId,
      true
    );
    if (error) {
      ctx.logger.error('[manual-seed] update match error', error);
      continue;
    }
    seeded.push({
      matchId: a.matchId,
      slot: a.slot,
      teamId: a.teamId,
      seed: a.seed ?? null,
    });
  }

  const { ids } = await stages.stageTeamIds(
    ctx.db,
    ctx.tenantId,
    targetStageId
  );
  const existingIds = new Set(ids);
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
  if (inserts.length > 0) await stages.insertStageTeams(ctx.db, inserts);

  return {
    result: { seeded, totalMatches: matchIds.length },
    audit: {
      entity_type: 'stage',
      entity_id: targetStageId,
      tournament_id: stage.tournament_id,
      payload: {
        mode: 'manual',
        seeded_count: seeded.length,
        replace_existing: replaceExisting,
      },
    },
  };
}

/* ---------------------------- seeding-preview --------------------------- */

export async function seedingPreview(
  ctx: ServiceContext,
  targetStageId: string,
  query: Record<string, unknown>
) {
  const sourceStageId =
    typeof query.sourceStageId === 'string' ? query.sourceStageId : null;
  const pattern: SeedingPattern =
    query.pattern === 'sequential' ? 'sequential' : 'standard';

  const { row: stage } = await stages.getStageCore(
    ctx.db,
    ctx.tenantId,
    targetStageId
  );
  if (!stage) throw fail(404, 'Stage not found');
  if (stage.stage_type !== 'bracket') {
    throw fail(400, 'Stage must be a bracket to compute seeding');
  }

  const { rows } = await matches.roundOneMatches(
    ctx.db,
    ctx.tenantId,
    targetStageId
  );
  const bracketMatches = rows ?? [];

  const lockedMatches = bracketMatches.filter((m) => isLockedStatus(m.status));
  const lock = {
    locked: lockedMatches.length > 0,
    lockedMatchCount: lockedMatches.length,
    reason:
      lockedMatches.length > 0
        ? `${lockedMatches.length} match(es) du round 1 déjà joué(s) ou en cours.`
        : null,
  };

  // Sources possibles = toutes les autres phases du tournoi.
  const sources = (
    await stages.siblingStages(
      ctx.db,
      ctx.tenantId,
      stage.tournament_id,
      targetStageId
    )
  ).map((s) => ({ id: s.id, name: s.name, stage_type: s.stage_type }));

  let proposed: ProposedSlot[] = [];
  if (sourceStageId && isValidUUID(sourceStageId)) {
    const sourceMatch = sources.find((s) => s.id === sourceStageId);
    if (sourceMatch) {
      try {
        const standings = await computeStageStandings(
          ctx.tenantId,
          sourceStageId,
          sourceMatch.stage_type ?? 'other'
        );
        proposed = computeProposedSeeding({
          standings: standings.map((s) => ({ teamId: s.teamId, rank: s.rank })),
          bracketMatches: bracketMatches.map((m) => ({ matchId: m.id })),
          pattern,
        });
      } catch (e) {
        ctx.logger.error('[seeding-preview] standings error', e);
      }
    }
  }

  const allTeamIds = new Set<string>();
  for (const m of bracketMatches) {
    if (m.team1_id) allTeamIds.add(m.team1_id);
    if (m.team2_id) allTeamIds.add(m.team2_id);
  }
  for (const p of proposed) allTeamIds.add(p.teamId);

  const { ids: stageTeamIds } = await stages.stageTeamIds(
    ctx.db,
    ctx.tenantId,
    targetStageId
  );
  for (const tid of stageTeamIds) allTeamIds.add(tid);

  const teamsById = new Map<string, TeamLite>();
  if (allTeamIds.size > 0) {
    for (const t of await related.teamsLite(
      ctx.db,
      ctx.tenantId,
      Array.from(allTeamIds)
    )) {
      teamsById.set(t.id, {
        id: t.id,
        name: t.name,
        short_name: t.short_name ?? null,
        logo_url: t.logo_url ?? null,
      });
    }
  }

  const proposedShaped = proposed.map((p) => ({
    ...p,
    team: teamsById.get(p.teamId) ?? null,
  }));

  const current: {
    matchId: string;
    slot: 1 | 2;
    teamId: string | null;
    status: string;
    team: TeamLite | null;
  }[] = [];
  for (const m of bracketMatches) {
    current.push({
      matchId: m.id,
      slot: 1,
      teamId: m.team1_id ?? null,
      status: m.status,
      team: m.team1_id ? (teamsById.get(m.team1_id) ?? null) : null,
    });
    current.push({
      matchId: m.id,
      slot: 2,
      teamId: m.team2_id ?? null,
      status: m.status,
      team: m.team2_id ? (teamsById.get(m.team2_id) ?? null) : null,
    });
  }

  const placedIds = new Set<string>();
  for (const m of bracketMatches) {
    if (m.team1_id) placedIds.add(m.team1_id);
    if (m.team2_id) placedIds.add(m.team2_id);
  }
  const availableTeams = stageTeamIds
    .filter((tid) => !placedIds.has(tid))
    .map((tid) => teamsById.get(tid))
    .filter((t): t is TeamLite => Boolean(t));

  return {
    stage: {
      id: stage.id,
      name: stage.name,
      tournament_id: stage.tournament_id,
    },
    bracketSize: bracketMatches.length * 2,
    sources,
    proposed: proposedShaped,
    current,
    lock,
    availableTeams,
  };
}

/* ---------------------- seeding par ratings (+ SoS) --------------------- */

type BreakdownRow = {
  teamId: string;
  teamName: string | null;
  shortName: string | null;
  logoUrl: string | null;
  rating: number;
  rd: number | null;
  sos: number;
  score: number;
  rank: number;
  provisional: boolean;
};

type RatingSeedingOk = {
  proposed: ProposedSlot[];
  breakdown: BreakdownRow[];
  bracketMatchCount: number;
  lock: { locked: boolean; reasons: string[] };
  bracketMatches: { id: string }[];
};

/**
 * Lit équipes + ratings + force du calendrier inter-événements, fait tourner
 * les moteurs purs et produit les slots proposés + le détail pour l'écran.
 * Aucune écriture : la prévisualisation et l'application calculent la même
 * chose à partir des mêmes entrées.
 */
async function computeRatingSeedingForStage(
  ctx: ServiceContext,
  stageId: string,
  method: SeedingMethod,
  pattern: SeedingPattern,
  sosWeight?: number
): Promise<RatingSeedingOk> {
  const { row: stage } = await stages.getStageCore(
    ctx.db,
    ctx.tenantId,
    stageId
  );
  if (!stage) throw fail(404, 'Stage not found');
  if (stage.stage_type !== 'bracket') {
    throw fail(400, 'Stage must be a bracket to compute seeding');
  }

  const { ids: stageTeamIds } = await stages.stageTeamIds(
    ctx.db,
    ctx.tenantId,
    stageId
  );
  if (stageTeamIds.length === 0) {
    throw fail(
      400,
      'Aucune équipe inscrite dans ce stage. Inscrivez des équipes avant de seeder.'
    );
  }

  const { rows } = await matches.roundOneMatches(ctx.db, ctx.tenantId, stageId);
  const bracketMatches = (rows ?? []).map((m) => ({
    id: m.id,
    status: m.status,
  }));
  const lockedCount = bracketMatches.filter((m) =>
    isLockedStatus(m.status)
  ).length;
  const lock = {
    locked: lockedCount > 0,
    reasons:
      lockedCount > 0
        ? [`${lockedCount} match(es) du round 1 déjà joué(s) ou en cours.`]
        : [],
  };

  const stageRatings = await related.teamRatings(
    ctx.db,
    ctx.tenantId,
    stageTeamIds
  );
  const ratingByStageTeam = new Map(stageRatings.map((r) => [r.team_id, r]));

  // Force du calendrier : matchs terminés / forfaits hors BYE qui touchent
  // une équipe de la phase.
  const stageTeamSet = new Set(stageTeamIds);
  const relevant = (
    await matches.finishedMatchesForSos(ctx.db, ctx.tenantId)
  ).filter(
    (m) =>
      (m.team1_id && stageTeamSet.has(m.team1_id)) ||
      (m.team2_id && stageTeamSet.has(m.team2_id))
  );
  const sosMatches: SoSMatch[] = relevant.map((m) => ({
    teamAId: m.team1_id,
    teamBId: m.team2_id,
    status: m.status,
    isBye: m.is_bye,
  }));

  const sosTeamIds = new Set<string>();
  for (const m of relevant) {
    if (m.team1_id) sosTeamIds.add(m.team1_id);
    if (m.team2_id) sosTeamIds.add(m.team2_id);
  }
  const ratingByTeam = new Map<string, number>();
  for (const [teamId, row] of ratingByStageTeam) {
    if (row.rating != null) ratingByTeam.set(teamId, row.rating);
  }
  const missing = [...sosTeamIds].filter((id) => !ratingByTeam.has(id));
  if (missing.length > 0) {
    for (const r of await related.teamRatings(ctx.db, ctx.tenantId, missing)) {
      if (r.rating != null) ratingByTeam.set(r.team_id, r.rating);
    }
  }

  const sosRes = computeStrengthOfSchedule({
    matches: sosMatches,
    ratingByTeam,
  });

  const inputs: SeedingTeamInput[] = stageTeamIds.map((teamId) => {
    const row = ratingByStageTeam.get(teamId);
    return {
      teamId,
      rating: row?.rating ?? null,
      rd: row?.rd ?? null,
      gamesPlayed: row?.games_played ?? 0,
      sos: sosRes.get(teamId)?.sos ?? null,
    };
  });
  const seeded = computeRatingSeeding({ teams: inputs, method, sosWeight });

  const proposed = computeProposedSeeding({
    standings: seeded.map((s) => ({ teamId: s.teamId, rank: s.rank })),
    bracketMatches: bracketMatches.map((m) => ({ matchId: m.id })),
    pattern,
  });

  const teamsById = new Map(
    (await related.teamsLite(ctx.db, ctx.tenantId, stageTeamIds)).map((t) => [
      t.id,
      t,
    ])
  );
  const breakdown: BreakdownRow[] = seeded.map((s) => {
    const t = teamsById.get(s.teamId);
    return {
      teamId: s.teamId,
      teamName: t?.name ?? null,
      shortName: t?.short_name ?? null,
      logoUrl: t?.logo_url ?? null,
      rating: s.rating,
      rd: s.rd,
      sos: s.sos,
      score: s.score,
      rank: s.rank,
      provisional: s.provisional,
    };
  });

  return {
    proposed,
    breakdown,
    bracketMatchCount: bracketMatches.length,
    lock,
    bracketMatches: bracketMatches.map((m) => ({ id: m.id })),
  };
}

export async function ratingSeedingPreview(
  ctx: ServiceContext,
  stageId: string,
  query: Record<string, unknown>
) {
  const method: SeedingMethod =
    query.method === 'rating' ? 'rating' : 'rating_sos';
  const pattern: SeedingPattern =
    query.pattern === 'sequential' ? 'sequential' : 'standard';
  const raw =
    typeof query.sosWeight === 'string' ? Number(query.sosWeight) : Number.NaN;
  const sosWeight = Number.isFinite(raw) ? raw : undefined;

  const r = await computeRatingSeedingForStage(
    ctx,
    stageId,
    method,
    pattern,
    sosWeight
  );
  return {
    proposed: r.proposed,
    breakdown: r.breakdown,
    bracketMatchCount: r.bracketMatchCount,
    lock: r.lock,
    method,
    pattern,
  };
}

export async function ratingSeed(
  ctx: ServiceContext,
  stageId: string,
  body: { method?: SeedingMethod; pattern?: SeedingPattern; sosWeight?: number }
): Promise<
  Audited<{
    seeded: ProposedSlot[];
    totalMatches: number;
    method: SeedingMethod;
    pattern: SeedingPattern;
  }>
> {
  const method: SeedingMethod = body.method ?? 'rating_sos';
  const pattern: SeedingPattern = body.pattern ?? 'standard';

  const result = await computeRatingSeedingForStage(
    ctx,
    stageId,
    method,
    pattern,
    body.sosWeight
  );

  if (result.bracketMatches.length === 0) {
    throw fail(
      400,
      "Aucun match de round 1 dans le bracket cible. Generez le bracket d'abord."
    );
  }
  if (result.lock.locked) {
    throw fail(
      409,
      result.lock.reasons[0] ??
        'Impossible de re-seed : des matchs du round 1 sont déjà joués ou en cours.'
    );
  }

  const { row: stage } = await stages.getStageCore(
    ctx.db,
    ctx.tenantId,
    stageId
  );

  void createBracketSnapshot({
    stageId,
    reason: 'rating_seed',
    staffId: staffIdOf(ctx),
    tenantId: ctx.tenantId,
  }).catch((e) =>
    ctx.logger.error('rating-seed: createBracketSnapshot failed', e)
  );

  const updates = result.proposed;
  for (const u of updates) {
    const { error } = await matches.setMatchSlot(
      ctx.db,
      ctx.tenantId,
      u.matchId,
      u.slot,
      u.teamId
    );
    if (error) ctx.logger.error('rating-seed update error:', error);
  }

  // seed = rang calculé pour chaque équipe (insertion ou mise à jour).
  const rankByTeam = new Map<string, number>();
  for (const s of result.breakdown) rankByTeam.set(s.teamId, s.rank);

  const { ids } = await stages.stageTeamIds(ctx.db, ctx.tenantId, stageId);
  const existingIds = new Set(ids);
  const inserts: {
    tenant_id: string;
    stage_id: string;
    team_id: string;
    seed: number;
    is_substitute: boolean;
    notes: null;
  }[] = [];
  for (const [teamId, rank] of rankByTeam) {
    if (existingIds.has(teamId)) {
      const { error } = await stages.updateStageTeamSeed(
        ctx.db,
        ctx.tenantId,
        stageId,
        teamId,
        rank
      );
      if (error) ctx.logger.error('rating-seed seed update error:', error);
    } else {
      inserts.push({
        tenant_id: ctx.tenantId,
        stage_id: stageId,
        team_id: teamId,
        seed: rank,
        is_substitute: false,
        notes: null,
      });
    }
  }
  if (inserts.length > 0) await stages.insertStageTeams(ctx.db, inserts);

  return {
    result: {
      seeded: updates,
      totalMatches: result.bracketMatches.length,
      method,
      pattern,
    },
    audit: {
      entity_type: 'stage',
      entity_id: stageId,
      tournament_id: stage?.tournament_id ?? null,
      payload: {
        method,
        pattern,
        seeded_count: updates.length,
        source: 'rating',
      },
    },
  };
}

/** Auteur du snapshot : le staff, ou personne (bot / système). */
export function staffIdOf(ctx: ServiceContext): string | null {
  return ctx.actor.kind === 'staff' ? ctx.actor.staffId : null;
}
