// features/admin/teams/client.ts — appels typés des écrans équipes (lot L10).
// Les URLs de l'API vivent ICI, plus dans les pages ni les panneaux.
//
// LES ÉCRITURES QUI PASSAIENT PAR `useIdempotentMutation` Y RESTENT (file hors
// ligne, `BgSyncQueuedError`) : suppression / actions groupées / imports de la
// liste, création, ajout de membre, inscription à un tournoi, disponibilités,
// verrou de roster. Ce module n'en fournit que les chemins (`teamsPaths`).
//
// Les routes CAPITAINE (`/api/teams/*`, « Mon équipe ») ne sont pas des routes
// staff : leur mode d'appel (`adminFetch` + `?as=`) reste celui de la page ;
// seuls leurs chemins sont rangés ici (`captainTeamPaths`).

import { adminRequest } from '@/utils/admin/adminHttp';
import type { TeamMemberRow, TeamRow } from '@/types/admin';
import type {
  TournamentRegistration,
  TournamentRow,
} from '@/types/adminTeamEdit';
import type { SearchResult } from '@/components/admin/teams/types';
import type { AvailabilityConstraint } from '@/utils/matches/availability';

const TEAMS = '/api/admin/teams';
const enc = encodeURIComponent;

export type TeamListParams = {
  limit: number;
  offset: number;
  isActive?: string;
  tournamentId?: string;
  search?: string;
};

export type TeamListResponse = { teams: TeamRow[]; total: number | null };

export type TeamTournamentsResponse = {
  registered: TournamentRegistration[];
  available: TournamentRow[];
  /** Effectif JOUANT (coachs/managers exclus). */
  playerCount?: number;
};

/** Ligne du panneau « verrou de roster » (GET roster-lock). */
export type TeamRosterLockRow = {
  tournamentId: string;
  tournamentName: string | null;
  rosterLockedAt: string | null;
  lockApplies: boolean;
  tournamentUnlockedUntil: string | null;
  teamUnlockedUntil: string | null;
  locks: boolean;
};

/** Ligne de l'historique staff d'une équipe (GET history). */
export type TeamHistoryLogRow = {
  id: string;
  readableAction: string;
  readableEntity: string | null;
  date: string;
  staff_id?: string | null;
  payload?: Record<string, unknown> | null;
};

export type TeamRosterBulkResponse = {
  successCount?: number;
  failureCount?: number;
};

export const teamsPaths = {
  list: TEAMS,
  byId: (id: string) => `${TEAMS}/${enc(id)}`,
  members: (id: string) => `${TEAMS}/${enc(id)}/members`,
  tournaments: (id: string) => `${TEAMS}/${enc(id)}/tournaments`,
  availability: (id: string) => `${TEAMS}/${enc(id)}/availability`,
  availabilityItem: (id: string, constraintId: string) =>
    `${TEAMS}/${enc(id)}/availability?id=${constraintId}`,
  rosterLock: (id: string) => `${TEAMS}/${enc(id)}/roster-lock`,
  rosterBulk: (id: string) => `${TEAMS}/${enc(id)}/roster-bulk`,
  history: (id: string, limit: number) =>
    `${TEAMS}/${enc(id)}/history?limit=${limit}`,
  bulk: `${TEAMS}/bulk`,
  importCsv: `${TEAMS}/import-csv`,
  importPlatform: `${TEAMS}/import-platform`,
  /** Ajout staff par e-mail / id (Mon équipe, création de compte). */
  addMember: `${TEAMS}/add-member`,
  /** Équipe gérée (`withSubjectRoute`) — lue avec `?as=` / `?teamId=`. */
  my: `${TEAMS}/my`,
  /** Liste courte pour les sélecteurs (sans total). */
  options: (limit: number) => `${TEAMS}?limit=${limit}&includeTotal=0`,
  /** Clé d'intégration d'import (réglage du site). */
  importApiKey: (key: string) => `/api/admin/site-settings/${key}`,
  siteSettings: '/api/admin/site-settings',
  /** Recherche joueuse (modale d'ajout de membre). */
  searchUsers: (q: string) => `/api/admin/users/search?q=${enc(q)}`,
} as const;

/** Routes capitaine (espace joueuse), appelées depuis « Mon équipe ». */
export const captainTeamPaths = {
  addMember: '/api/teams/add-member',
  updateMember: '/api/teams/update-member',
  transferCaptain: '/api/teams/transfer-captain',
  toggleJoinable: '/api/teams/toggle-joinable',
  joinRequests: '/api/teams/join-requests',
  pendingJoinRequests: '/api/teams/join-requests?status=pending',
  searchPlayers: (q: string) => `/api/teams/search-players?q=${enc(q)}`,
} as const;

function listUrl(p: TeamListParams): string {
  const sp = new URLSearchParams();
  sp.set('limit', String(p.limit));
  sp.set('offset', String(p.offset));
  sp.set('includeTotal', '1');
  if (p.search) sp.set('search', p.search);
  if (p.isActive) sp.set('isActive', p.isActive);
  if (p.tournamentId) sp.set('tournamentId', p.tournamentId);
  return `${TEAMS}?${sp.toString()}`;
}

export const teamsClient = {
  list: (p: TeamListParams) => adminRequest<TeamListResponse>(listUrl(p)),
  /** Liste courte (sélecteurs) : 200 / 500 équipes, sans total. */
  options: (limit: number) =>
    adminRequest<{ teams?: TeamRow[] }>(teamsPaths.options(limit)),
  get: (id: string) =>
    adminRequest<{ team: TeamRow | null }>(teamsPaths.byId(id)),
  update: (id: string, patch: Partial<TeamRow>) =>
    adminRequest<{ team: TeamRow }>(teamsPaths.byId(id), {
      method: 'PATCH',
      json: patch,
    }),
  members: (id: string) =>
    adminRequest<{ members?: TeamMemberRow[] }>(teamsPaths.members(id)),
  updateMember: (id: string, body: Record<string, unknown>) =>
    adminRequest(teamsPaths.members(id), { method: 'PATCH', json: body }),
  removeMember: (id: string, memberId: string) =>
    adminRequest(teamsPaths.members(id), {
      method: 'DELETE',
      json: { memberId },
    }),
  tournaments: (id: string) =>
    adminRequest<TeamTournamentsResponse>(teamsPaths.tournaments(id)),
  unregisterTournament: (id: string, tournamentId: string) =>
    adminRequest(teamsPaths.tournaments(id), {
      method: 'DELETE',
      json: { tournamentId },
    }),
  availability: (id: string) =>
    adminRequest<{ constraints?: AvailabilityConstraint[] }>(
      teamsPaths.availability(id)
    ),
  rosterLock: (id: string) =>
    adminRequest<{ tournaments?: TeamRosterLockRow[] }>(
      teamsPaths.rosterLock(id)
    ),
  rosterBulk: (id: string, body: Record<string, unknown>) =>
    adminRequest<TeamRosterBulkResponse>(teamsPaths.rosterBulk(id), {
      method: 'POST',
      json: body,
    }),
  history: (id: string, limit: number) =>
    adminRequest<{ logs?: TeamHistoryLogRow[] }>(teamsPaths.history(id, limit)),
  /** Clé d'API d'import (réglage du site) ; `null` si absente ou illisible. */
  importApiKey: (key: string) =>
    adminRequest<{ value?: string }>(teamsPaths.importApiKey(key)).catch(
      () => null
    ),
  saveImportApiKey: (entry: {
    key: string;
    value: string;
    description: string;
  }) => adminRequest(teamsPaths.siteSettings, { method: 'POST', json: entry }),
  searchUsers: (q: string, signal?: AbortSignal) =>
    adminRequest<{ players?: SearchResult[] }>(teamsPaths.searchUsers(q), {
      signal,
    }),
};
