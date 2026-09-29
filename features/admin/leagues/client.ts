// features/admin/leagues/client.ts — appels typés des écrans ligues (lot L10).
// Les URLs de l'API vivent ICI, plus dans les pages. Les types sont ceux de
// `types/leagues.ts`, contrat déjà partagé avec les pages publiques.
//
// Les ÉCRITURES passent par `useIdempotentMutation` (file hors ligne) : le
// client leur fournit leurs URLs (`leaguesUrls`), les hooks les enveloppent.

import { adminRequest } from '@/utils/admin/adminHttp';
import type {
  League,
  LeagueStandingsResponse,
  LeaguesListResponse,
} from '@/types/leagues';

const BASE = '/api/admin/leagues';
const enc = encodeURIComponent;

export const leaguesUrls = {
  collection: BASE,
  byId: (id: string) => `${BASE}/${enc(id)}`,
  standings: (id: string) => `${BASE}/${enc(id)}/standings`,
  recompute: (id: string) => `${BASE}/${enc(id)}/recompute`,
  tournaments: (id: string) => `${BASE}/${enc(id)}/tournaments`,
  tournament: (id: string, tournamentId: string) =>
    `${BASE}/${enc(id)}/tournaments/${enc(tournamentId)}`,
};

/** Tournoi proposé au sélecteur de liaison. */
export type LeagueTournamentOption = {
  id: string;
  name: string;
  slug: string | null;
};

export const leaguesClient = {
  list: () => adminRequest<LeaguesListResponse>(BASE),
  get: (id: string) => adminRequest<League>(leaguesUrls.byId(id)),
  standings: (id: string) =>
    adminRequest<LeagueStandingsResponse>(leaguesUrls.standings(id)),
  /** Tournois du tenant (200 max), pour le sélecteur « lier un tournoi ». */
  tournamentOptions: () =>
    adminRequest<{
      tournaments: LeagueTournamentOption[];
      total: number | null;
    }>('/api/admin/tournaments?limit=200'),
};
