// features/player/scrims/service/directory.ts — annuaire d'équipes CONNECTÉ
// (R4). Déplacé de pages/api/player/teams-directory (lot P13), à l'identique.
//
// Il répond à « qui puis-je affronter, maintenant, à mon niveau ? » en
// croisant ce que la liste publique n'a pas : la recherche de scrim vivante de
// chaque équipe (R5), le rating (team_ratings), la fiabilité (R10), les
// rythmes récurrents (N1), les affrontements récents, et le recrutement
// (annonce `team_openings` d'un côté, `is_joinable` + effectif de l'autre).
// Il purge aussi les annonces périmées à la lecture (`expireStaleSearches`).

import { LegacyAdminError } from '@/utils/admin/errors';
import { MAX_TEAM_PLAYERS } from '@/utils/constants';
import {
  resolveTeamSkillRating,
  type ResolvedTeamSkillRating,
} from '@/utils/overwatchRank';
import { getManagedTeam } from '@/utils/teams/managementAccess';
import {
  expireStaleSearches,
  isSearchLive,
  overlappingSlots,
  type ScrimSearchRow,
} from '@/utils/teams/scrimSearch';
import {
  EMPTY_RELIABILITY,
  loadReliabilityMap,
} from '@/utils/teams/reliability';
import { computeOpponentMatch } from '@/utils/teams/opponentMatch';
import {
  loadMyRhythmTimezone,
  loadTeamRhythmCores,
} from '@/utils/teams/teamRhythmStore';
import { overlappingRhythmSlots } from '@/utils/teams/teamRhythm';
import { countPlayingMembers } from '@/utils/teams/roleKind';
import {
  indexOpeningsByTeam,
  type DirectoryOpeningRow,
} from '@/utils/teams/directoryRecruitment';
import {
  listActiveSearches,
  listActiveTeams,
  listRecentEncounterPairs,
  listRecentOpenings,
  listTeamRatings,
  type RosterSkill,
} from '../repository/directory';
import type { DirectoryTeam, TeamsDirectoryResponse } from '../schemas';
import type { ScrimsCtx } from './context';
import { loadNetworkTeams } from './directoryNetwork';

/** Plafond de lecture des annonces, aligné sur la liste publique (120). */
const OPENINGS_READ_LIMIT = 120;
/** Fenêtre sur laquelle « on les a déjà jouées » reste une information utile. */
const ENCOUNTER_WINDOW_DAYS = 90;

/**
 * Affrontements récents (match OU scrim) entre mon équipe et chaque autre :
 * facteur de NOUVEAUTÉ du score. Ne jette jamais (repli : 0 affrontement).
 */
async function loadRecentEncounters(
  ctx: ScrimsCtx,
  myTeamId: string | null
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!myTeamId) return out;
  const since = new Date(
    Date.now() - ENCOUNTER_WINDOW_DAYS * 86_400_000
  ).toISOString();
  try {
    const rows = await listRecentEncounterPairs(
      ctx.db,
      ctx.tenantId,
      myTeamId,
      since
    );
    for (const row of rows) {
      const other =
        row.team1_id === myTeamId
          ? (row.team2_id as string | null)
          : (row.team1_id as string | null);
      if (other) out.set(other, (out.get(other) ?? 0) + 1);
    }
  } catch (err) {
    ctx.logger.error('[teams-directory] encounters crash', err);
  }
  return out;
}

export async function loadTeamsDirectory(
  ctx: ScrimsCtx,
  requestedTeamId: string | null
): Promise<TeamsDirectoryResponse> {
  const { db, tenantId, userId } = ctx;

  // Purge paresseuse des annonces périmées.
  await expireStaleSearches(tenantId);

  const access = await getManagedTeam(userId, tenantId, requestedTeamId);
  const myTeamId = access?.teamId ?? null;

  const { teams, error: teamsErr } = await listActiveTeams(db, tenantId);
  if (teamsErr) {
    ctx.logger.error('[teams-directory] teams error', teamsErr);
    throw new LegacyAdminError(500, 'Lecture des équipes impossible.');
  }
  const teamIds = teams.map((t) => t.id);

  const memberCountByTeam = new Map<string, number>();
  const skillAverageByTeam = new Map<string, ResolvedTeamSkillRating>();
  for (const t of teams) {
    const roster = (t.team_members ?? []) as RosterSkill[];
    memberCountByTeam.set(t.id, countPlayingMembers(roster));
    // Le SR d'ensemble déclaré prime sur la moyenne des fiches.
    const avg = resolveTeamSkillRating(t.skill_rating, roster);
    if (avg) skillAverageByTeam.set(t.id, avg);
  }

  // Fuseau de référence : celui que J'AI déclaré (pas de recoupement
  // fantôme entre fuseaux).
  const referenceTimezone =
    (await loadMyRhythmTimezone(tenantId, userId)) || 'Europe/Paris';

  const [searches, ratings, reliabilityMap, rhythmCores, encounters, openings] =
    await Promise.all([
      listActiveSearches(db, tenantId),
      listTeamRatings(db, tenantId),
      loadReliabilityMap(tenantId, teamIds),
      loadTeamRhythmCores(tenantId, referenceTimezone, memberCountByTeam),
      loadRecentEncounters(ctx, myTeamId),
      listRecentOpenings(db, tenantId, OPENINGS_READ_LIMIT),
    ]);

  // Les annonces sont un complément : leur panne ne casse pas l'annuaire.
  if (openings.error) {
    ctx.logger.error('[teams-directory] openings error', openings.error);
  }
  const openingByTeam = indexOpeningsByTeam(
    openings.error ? [] : (openings.rows as DirectoryOpeningRow[]),
    teams.map((t) => ({ id: t.id, name: t.name as string | null }))
  );

  const searchByTeam = new Map<string, ScrimSearchRow>();
  for (const row of searches as unknown as ScrimSearchRow[]) {
    if (isSearchLive(row)) searchByTeam.set(row.team_id, row);
  }

  const ratingByTeam = new Map<string, number>();
  for (const row of ratings) {
    if (typeof row.rating === 'number')
      ratingByTeam.set(row.team_id, row.rating);
  }

  // Mes propres créneaux : « 3 créneaux en commun » plutôt qu'une pastille.
  const mySlots = myTeamId ? (searchByTeam.get(myTeamId)?.slots ?? []) : [];
  const myRhythm = myTeamId ? (rhythmCores.get(myTeamId) ?? []) : [];
  const myRating = myTeamId ? (ratingByTeam.get(myTeamId) ?? null) : null;
  const mySkillAverage = myTeamId
    ? (skillAverageByTeam.get(myTeamId) ?? null)
    : null;

  const directory: DirectoryTeam[] = teams
    .filter((t) => t.id !== myTeamId)
    .map((t) => {
      const id = t.id;
      const memberCount = memberCountByTeam.get(id) ?? 0;
      const search = searchByTeam.get(id) ?? null;
      const reliability = reliabilityMap.get(id) ?? EMPTY_RELIABILITY;
      const commonSlots = search
        ? overlappingSlots(mySlots, search.slots || [])
        : [];
      const theirRhythm = rhythmCores.get(id) ?? [];
      const commonRhythm = overlappingRhythmSlots(myRhythm, theirRhythm);
      const encountersRecent = encounters.get(id) ?? 0;

      const match = computeOpponentMatch({
        commonSearchSlots: commonSlots.length,
        commonRhythmSlots: commonRhythm.length,
        // Sans déclaration des deux côtés, « 0 créneau commun » est un trou
        // de données, pas une incompatibilité.
        slotsComparable:
          (mySlots.length > 0 || myRhythm.length > 0) &&
          ((search?.slots?.length ?? 0) > 0 || theirRhythm.length > 0),
        myRating,
        theirRating: ratingByTeam.get(id) ?? null,
        mySkillRating: mySkillAverage?.average ?? null,
        theirSkillRating: skillAverageByTeam.get(id)?.average ?? null,
        responseRate: reliability.responseRate,
        encountersRecent,
      });

      return {
        id,
        name: t.name,
        short_name: t.short_name ?? null,
        logo_url: t.logo_url ?? null,
        slug: t.slug ?? null,
        country: t.country ?? null,
        member_count: memberCount,
        is_joinable: Boolean(t.is_joinable),
        is_full: memberCount >= MAX_TEAM_PLAYERS,
        opening: openingByTeam.get(id) ?? null,
        rating: ratingByTeam.get(id) ?? null,
        skill_average: skillAverageByTeam.get(id) ?? null,
        reliability,
        scrim_search: search
          ? {
              slots: search.slots || [],
              format: search.format,
              note: search.note,
              expires_at: search.expires_at,
              common_slots: commonSlots,
            }
          : null,
        common_rhythm_slots: commonRhythm,
        encounters_recent: encountersRecent,
        match,
      };
    });

  // Tri par SCORE de compatibilité (N4) ; à score égal une annonce vivante
  // l'emporte, puis l'ordre alphabétique (déterministe).
  directory.sort((a, b) => {
    if (a.match.score !== b.match.score) return b.match.score - a.match.score;
    const as = a.scrim_search ? 0 : 1;
    const bs = b.scrim_search ? 0 : 1;
    if (as !== bs) return as - bs;
    return a.name.localeCompare(b.name);
  });

  // Le réseau : vide tant que mon espace n'a pas ouvert le sien.
  const networkTeams = await loadNetworkTeams(ctx, mySlots);

  return {
    teams: directory,
    networkTeams,
    myTeamId,
    hasOwnSearch: mySlots.length > 0,
    mySkillAverage,
  };
}
