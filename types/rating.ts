// types/rating.ts
//
// Types partagés pour la feature "rating joueur persistant + H2H".
// Les moteurs PURS vivent dans utils/rating/* ; ces types décrivent les rows
// DB et les shapes exposées par l'API publique.

/** Row `player_ratings` (colonnes live). */
export type PlayerRatingRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  rating: number;
  rd: number;
  volatility: number;
  games_played: number;
  wins: number;
  losses: number;
  draws: number;
  peak_rating: number;
  last_match_at: string | null;
  display_name: string | null;
  battle_tag: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

/** Entrée du leaderboard public. */
export type LeaderboardPlayer = {
  userId: string;
  displayName: string | null;
  battleTag: string | null;
  avatarUrl: string | null;
  rating: number;
  rd: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  rank: number;
};

/** Réponse `GET /api/players/leaderboard`. */
export type LeaderboardResponse = {
  players: LeaderboardPlayer[];
};

/** Bloc "player" du profil public. */
export type PlayerProfileCore = {
  userId: string;
  displayName: string | null;
  battleTag: string | null;
  avatarUrl: string | null;
  rating: number;
  rd: number;
  volatility: number;
  peakRating: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  rank: number;
};

/** Point de courbe (history) du profil. */
export type PlayerProfileHistoryPoint = {
  matchId: string;
  tournamentId: string | null;
  occurredAt: string;
  ratingBefore: number;
  ratingAfter: number;
  result: 'win' | 'loss' | 'draw';
  opponentAvgRating: number | null;
};

/** Match récent affiché sur le profil. */
export type PlayerProfileRecentMatch = {
  matchId: string;
  tournamentId: string | null;
  occurredAt: string;
  result: 'win' | 'loss' | 'draw';
  opponentTeamId: string | null;
  opponentTeamName: string | null;
};

/** Ligne head-to-head. */
export type PlayerProfileH2H = {
  opponentUserId: string;
  opponentDisplayName: string | null;
  opponentBattleTag: string | null;
  wins: number;
  losses: number;
  games: number;
};

/** Réponse `GET /api/players/[userId]/profile`. */
export type PlayerProfileResponse = {
  player: PlayerProfileCore;
  history: PlayerProfileHistoryPoint[];
  recentMatches: PlayerProfileRecentMatch[];
  h2h: PlayerProfileH2H[];
};
