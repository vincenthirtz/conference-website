// utils/eventScheduleConflicts.ts
//
// Detection PURE des conflits de planning d'equipe dans un run-of-show
// (roadmap #04 — 1er pas : detection + alerte, PAS de resolution auto).
//
// Un conflit = deux segments de type 'match' dont les plages horaires
// PLANIFIEES se chevauchent ET qui referencent des matchs partageant au moins
// une equipe (ex: "equipe X programmee sur 2 matchs simultanes").
//
// Pourquoi un util pur separe de computeRunSchedule ?
//   - computeRunSchedule est la source de verite des HORAIRES (mode hybride
//     computed/anchored). Son commentaire signale deja que "le Director gere
//     les conflits (ex: chevauchement)" — c'est ce TODO qu'on implemente ici.
//   - La detection consomme le `ComputedRunSchedule` (horaires) + le mapping
//     match->equipes (donnee metier hors du run). On garde les deux
//     responsabilites disjointes : computeRunSchedule ne connait pas les
//     equipes, cet util ne recalcule pas d'horaires.
//   - Pure/deterministe : pas de Date.now, pas d'effet de bord. Les horaires
//     viennent EXCLUSIVEMENT du schedule (donc pas de `nowMs` en argument).

import type { EventSegment } from '@/types/events';
import type { ComputedRunSchedule } from '@/utils/eventSchedule';

/**
 * Equipes d'un match, tel que fourni par l'appelant (le Director resout
 * match_id -> equipes via /api/admin/matches/[matchId]). team1Id/team2Id sont
 * la CLE d'identite pour detecter le partage ; les noms/label servent
 * uniquement a l'affichage.
 */
export type MatchTeams = {
  team1Id: string | null;
  team2Id: string | null;
  team1Name?: string | null;
  team2Name?: string | null;
  /** Libelle lisible du match (ex: "A vs B"). Fallback: nom du segment. */
  label?: string | null;
};

/**
 * Un conflit detecte entre deux segments-match partageant une equipe et se
 * chevauchant dans le temps planifie. `segmentAId` est toujours le segment qui
 * commence EN PREMIER (ordre deterministe par plannedStartAt, puis id).
 */
export type TeamScheduleConflict = {
  /** Equipe partagee, cause du conflit. */
  teamId: string;
  /** Nom de l'equipe si connu (pour l'affichage), sinon null. */
  teamName: string | null;
  /** Segment le plus tot (chronologiquement). */
  segmentAId: string;
  /** Segment le plus tard. */
  segmentBId: string;
  /** Libelle lisible du match A. */
  matchALabel: string;
  /** Libelle lisible du match B. */
  matchBLabel: string;
  /** Debut du chevauchement (ISO) = max(startA, startB). */
  overlapStart: string;
  /** Fin du chevauchement (ISO) = min(endA, endB). */
  overlapEnd: string;
};

type ConflictCandidate = {
  segmentId: string;
  matchId: string;
  startMs: number;
  endMs: number;
  teams: MatchTeams;
  label: string;
};

function shortId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

/**
 * Libelle d'affichage d'un match. Priorite :
 *   1. `matchTeams.label` (fourni par l'appelant).
 *   2. "team1Name vs team2Name" si au moins un nom est connu.
 *   3. Titre du segment.
 *   4. "Match #<short_id>".
 */
function buildLabel(teams: MatchTeams, segment: EventSegment): string {
  if (teams.label && teams.label.trim().length > 0) return teams.label;
  const a = teams.team1Name?.trim();
  const b = teams.team2Name?.trim();
  if (a || b) return `${a || '?'} vs ${b || '?'}`;
  if (segment.title && segment.title.trim().length > 0) return segment.title;
  return `Match #${shortId(segment.match_id ?? segment.id)}`;
}

/** Nom d'une equipe (par id) tel que connu dans un des deux matchs. */
function teamNameFrom(
  candidate: ConflictCandidate,
  teamId: string
): string | null {
  if (candidate.teams.team1Id === teamId && candidate.teams.team1Name) {
    return candidate.teams.team1Name;
  }
  if (candidate.teams.team2Id === teamId && candidate.teams.team2Name) {
    return candidate.teams.team2Name;
  }
  return null;
}

/** Ids d'equipe non-null d'un match. */
function teamIdsOf(teams: MatchTeams): string[] {
  const ids: string[] = [];
  if (teams.team1Id) ids.push(teams.team1Id);
  // Un match ou team1_id === team2_id serait aberrant ; on evite tout de meme
  // un doublon.
  if (teams.team2Id && teams.team2Id !== teams.team1Id) ids.push(teams.team2Id);
  return ids;
}

/**
 * Detecte les chevauchements d'equipe dans un run.
 *
 * @param schedule    Horaires planifies (source de verite), issu de
 *                    computeRunSchedule. Seuls les segments presents ici ont
 *                    un timing (les skipped en sont deja absents).
 * @param segments    Tous les segments du run (pour type/match_id/titre).
 * @param matchTeams  Map match_id -> equipes. Un segment dont le match_id est
 *                    absent de la Map est ignore (equipes inconnues).
 * @returns           Liste dedupliquee de conflits, triee de facon
 *                    deterministe (par debut de chevauchement, puis ids).
 */
export function detectTeamScheduleConflicts(
  schedule: ComputedRunSchedule,
  segments: EventSegment[],
  matchTeams: Map<string, MatchTeams>
): TeamScheduleConflict[] {
  // Index timing par segmentId (les skipped sont deja hors de schedule.segments).
  const timingById = new Map(schedule.segments.map((s) => [s.segmentId, s]));

  // 1. Construire les candidats : segments type='match', match_id resoluble,
  //    non-skipped, avec un timing dans le schedule.
  const candidates: ConflictCandidate[] = [];
  for (const seg of segments) {
    if (seg.type !== 'match') continue;
    if (seg.status === 'skipped') continue;
    if (!seg.match_id) continue;
    const teams = matchTeams.get(seg.match_id);
    if (!teams) continue;
    const timing = timingById.get(seg.id);
    if (!timing) continue;
    const startMs = Date.parse(timing.plannedStartAt);
    const endMs = Date.parse(timing.plannedEndAt);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue;
    candidates.push({
      segmentId: seg.id,
      matchId: seg.match_id,
      startMs,
      endMs,
      teams,
      label: buildLabel(teams, seg),
    });
  }

  // 2. Tri deterministe : par debut, puis par id de segment (departage stable).
  candidates.sort((a, b) =>
    a.startMs !== b.startMs
      ? a.startMs - b.startMs
      : a.segmentId < b.segmentId
        ? -1
        : a.segmentId > b.segmentId
          ? 1
          : 0
  );

  // 3. Comparaison par paires. Chevauchement STRICT : startA < endB && startB
  //    < endA (les creneaux jointifs — fin de l'un = debut de l'autre — ne
  //    sont PAS un conflit).
  const conflicts: TeamScheduleConflict[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < candidates.length; i++) {
    const a = candidates[i];
    for (let j = i + 1; j < candidates.length; j++) {
      const b = candidates[j];
      // Overlap temporel ?
      if (!(a.startMs < b.endMs && b.startMs < a.endMs)) continue;

      // Equipes partagees ?
      const teamsA = teamIdsOf(a.teams);
      const teamsB = new Set(teamIdsOf(b.teams));
      const shared = teamsA.filter((id) => teamsB.has(id));
      if (shared.length === 0) continue;

      const overlapStart = Math.max(a.startMs, b.startMs);
      const overlapEnd = Math.min(a.endMs, b.endMs);

      for (const teamId of shared) {
        // Dedup : une paire peut partager 2 equipes -> 2 conflits distincts,
        // mais on ne veut jamais le meme (teamId, paire) deux fois.
        const key = `${teamId}|${a.segmentId}|${b.segmentId}`;
        if (seen.has(key)) continue;
        seen.add(key);

        conflicts.push({
          teamId,
          teamName: teamNameFrom(a, teamId) ?? teamNameFrom(b, teamId),
          segmentAId: a.segmentId,
          segmentBId: b.segmentId,
          matchALabel: a.label,
          matchBLabel: b.label,
          overlapStart: new Date(overlapStart).toISOString(),
          overlapEnd: new Date(overlapEnd).toISOString(),
        });
      }
    }
  }

  return conflicts;
}
