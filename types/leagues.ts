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
  /** Scrims de la saison joués par l'équipe. Un scrim n'a pas de rang final :
   *  il compte à part, et n'entre ni dans `tournamentsCounted` ni `bestRank`. */
  scrimsCounted: number;
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

/** Scrim rattaché à une league, avec son résultat. */
export type LeagueScrimRef = {
  id: string;
  name: string | null;
  slug: string | null;
  weight: number;
  team1Name: string | null;
  team2Name: string | null;
  team1Score: number | null;
  team2Score: number | null;
  scheduledDate: string | null;
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
  scrims: LeagueScrimRef[];
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
