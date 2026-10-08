// features/admin/stages/client.ts — chemins et appels typés des écrans de
// PHASE (`/api/admin/stages/[stageId]/**`) : fiche, équipes, poules, suisse,
// seeding, historique, lobbies FFA, opérations en masse — lot L10, vague
// client 2.
//
// Les ÉCRITURES qui passaient par `useIdempotentMutation` (file hors ligne,
// `BgSyncQueuedError`) y restent : ce module ne leur fournit que leurs
// chemins (`stageUrls`).
//
// `lobbyUrls` : lobbies FFA appelés DEPUIS la gestion des lobbies d'une
// phase. Le domaine « lobbies » a son propre écran ; ces chemins restent ici
// tant que les deux n'ont pas été rapprochés.

const S = '/api/admin/stages';
const enc = encodeURIComponent;

export const stageUrls = {
  byId: (id: string) => `${S}/${enc(id)}`,
  teams: (id: string) => `${S}/${enc(id)}/teams`,
  groups: (id: string) => `${S}/${enc(id)}/groups`,
  generateGroupMatches: (id: string) =>
    `${S}/${enc(id)}/generate-group-matches`,
  standings: (id: string) => `${S}/${enc(id)}/standings`,
  standingsCsv: (id: string) => `${S}/${enc(id)}/standings?export=csv`,
  swiss: (id: string) => `${S}/${enc(id)}/swiss`,
  swissStatus: (id: string) => `${S}/${enc(id)}/swiss-status`,
  generateSwissRound: (id: string) => `${S}/${enc(id)}/generate-swiss-round`,
  completionStatus: (id: string) => `${S}/${enc(id)}/completion-status`,
  history: (id: string, params: URLSearchParams) =>
    `${S}/${enc(id)}/history?${params.toString()}`,
  autoByes: (id: string) => `${S}/${enc(id)}/auto-byes`,
  autoSeed: (id: string) => `${S}/${enc(id)}/auto-seed`,
  manualSeed: (id: string) => `${S}/${enc(id)}/manual-seed`,
  ratingSeed: (id: string) => `${S}/${enc(id)}/rating-seed`,
  /** `qs` : chaîne de requête sans `?` (vide = aucune). */
  seedingPreview: (id: string, qs = '') =>
    `${S}/${enc(id)}/seeding-preview${qs ? `?${qs}` : ''}`,
  ratingSeedingPreview: (id: string, params: URLSearchParams) =>
    `${S}/${enc(id)}/rating-seeding-preview?${params.toString()}`,
  clone: (id: string) => `${S}/${enc(id)}/clone`,
  advance: (id: string) => `${S}/${enc(id)}/advance`,
  bulkMatches: (id: string) => `${S}/${enc(id)}/bulk-matches`,
  lobbies: (id: string) => `${S}/${enc(id)}/lobbies`,
  /** GET (liste) / POST (snapshot manuel) / PATCH (restauration, admin+). */
  snapshots: (id: string) => `${S}/${enc(id)}/snapshots`,
  /** GET / POST / DELETE (`{ id }`) des dérogations de départage. */
  tiebreakerOverride: (id: string) => `${S}/${enc(id)}/tiebreaker-override`,
  /** POST `{ team_id, mode, reason }` (disqualifier) ; DELETE `?team_id=` (réintégrer). */
  disqualify: (id: string) => `${S}/${enc(id)}/disqualify`,
  reinstate: (id: string, teamId: string) =>
    `${S}/${enc(id)}/disqualify?team_id=${enc(teamId)}`,
  batchScores: (id: string) => `${S}/${enc(id)}/batch-scores`,
};

/* ------------------------- outils de rattrapage ------------------------- */

/** Ligne de `GET …/snapshots` (features/admin/stages/repository/related). */
export type BracketSnapshot = {
  id: number;
  stage_id: string;
  taken_at: string;
  taken_by_staff_id: string | null;
  reason: string | null;
  match_count: number | null;
  staff?: { id: string; display_name: string | null; role: string } | null;
};

/** Ligne de `GET …/tiebreaker-override` : « winner passe devant loser ». */
export type TiebreakerOverride = {
  id: number;
  winner_team_id: string;
  loser_team_id: string;
  reason: string | null;
  set_by_staff_id: string | null;
  set_at: string;
  winner?: { id: string; name: string } | null;
  loser?: { id: string; name: string } | null;
};

/** Mode de disqualification : matchs restants perdus par forfait, ou annulés. */
export type { DisqualificationMode } from '../../../utils/stages/disqualification';
import type { DisqualificationMode } from '../../../utils/stages/disqualification';

/** Champs de disqualification d'une ligne de `GET …/teams` (`null` = pas disqualifiée). */
export type StageTeamDisqualificationFields = {
  disqualified_at: string | null;
  disqualification_mode: DisqualificationMode | null;
  disqualification_reason: string | null;
  disqualified_by: string | null;
};

/** Corps de `POST …/disqualify`. */
export type DisqualifyTeamRequest = {
  team_id: string;
  mode: DisqualificationMode;
  /** 3 à 500 caractères (après trim). */
  reason: string;
};

/** Réponse 201 de `POST …/disqualify`. */
export type DisqualifyTeamResponse = {
  mode: DisqualificationMode;
  teamId: string;
  teamName: string | null;
  disqualifiedAt: string;
  /** Matchs passés en forfait (mode `forfeit`). */
  forfeited: string[];
  /** Matchs annulés (mode `annul`). */
  cancelled: string[];
  /** Matchs laissés tels quels, à traiter à la main. */
  skipped: Array<{
    id: string;
    reason: 'disputed' | 'no_opponent' | 'status_changed';
  }>;
  /** Match dont le traitement a échoué (le traitement s'arrête là). */
  failed: { id: string; error: string } | null;
  /** Matchs pas encore traités à cause de `failed`. */
  notProcessed: string[];
  /** `false` si `failed` : la disqualification est posée, des matchs restent. */
  complete: boolean;
};

/** Réponse de `DELETE …/disqualify`. */
export type ReinstateTeamResponse = {
  teamId: string;
  reinstated: true;
  /** Matchs de la phase restés en forfait / annulés : rien n'est restauré. */
  matchesNotRestored: number;
};

/** Une ligne du corps de `POST …/batch-scores`. */
export type BatchScoreEntry = {
  matchId: string;
  team1Score: number;
  team2Score: number;
};

/** Réponse de `POST …/batch-scores` (200 partiel ou 500 tout en échec). */
export type BatchScoresResponse = {
  results: Array<{
    matchId: string;
    success: boolean;
    error?: string;
    winnerTeamId?: string | null;
  }>;
  successCount: number;
  failureCount: number;
};

export const lobbyUrls = {
  byId: (id: string) => `/api/admin/lobbies/${enc(id)}`,
  placements: (id: string) => `/api/admin/lobbies/${enc(id)}/placements`,
};
