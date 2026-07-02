// types/leagues.ts
//
// Types partagés pour la feature "leagues / saisons".
// Le moteur PUR (utils/leagues/computeStandings.ts) calcule les standings ;
// ces types décrivent les rows DB et les shapes exposées par l'API.

export type LeagueStatus = 'draft' | 'active' | 'finished' | 'archived';

/** Row `leagues` (colonnes live). */
export type League = {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  description: string | null;
  game: string | null;
  status: LeagueStatus;
  start_date: string | null;
  end_date: string | null;
  points_table: Record<string, number>;
  is_public: boolean;
  created_at: string;
  updated_at: string;
};

/** Row `league_standings` enrichie (join teams) pour l'API publique. */
export type LeagueStandingPublic = {
  teamId: string;
  teamName: string | null;
  teamSlug: string | null;
  logoUrl: string | null;
  points: number;
  tournamentsCounted: number;
  bestRank: number | null;
  rank: number;
};

/** Tournoi lié à une league (avec son poids). */
export type LeagueTournamentRef = {
  id: string;
  name: string | null;
  slug: string | null;
  weight: number;
};

/** Réponse publique `GET /api/leagues`. */
export type LeaguesListResponse = {
  leagues: League[];
};

/** Réponse publique `GET /api/leagues/[slug]`. */
export type LeagueDetailResponse = {
  league: League;
  standings: LeagueStandingPublic[];
  tournaments: LeagueTournamentRef[];
};

/**
 * Réponse admin `GET /api/admin/leagues/[id]/standings`.
 * Identique aux standings publics mais scopée tenant + id (visible même pour
 * une league draft/privée, contrairement à l'endpoint public par slug).
 */
export type LeagueStandingsResponse = {
  standings: LeagueStandingPublic[];
  tournaments: LeagueTournamentRef[];
};
