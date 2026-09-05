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

/**
 * Identité d'équipe accolée à une joueuse dans les listes publiques.
 *
 * Sert de REPLI D'AVATAR : la plupart des joueuses n'ont pas de photo de
 * profil, et le logo de leur équipe vaut mieux qu'une pastille d'initiales.
 */
export type PlayerTeamIdentity = {
  teamName: string | null;
  teamSlug: string | null;
  teamLogoUrl: string | null;
};

/** Entrée du leaderboard public. */
export type LeaderboardPlayer = PlayerTeamIdentity & {
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

/**
 * Entrée d'un axe SECONDAIRE du classement (progression 30 jours, saison) :
 * une joueuse et sa variation de rating sur la fenêtre considérée. `rank` est
 * la position sur CET axe, pas au classement général.
 */
export type LeaderboardMover = PlayerTeamIdentity & {
  userId: string;
  displayName: string | null;
  battleTag: string | null;
  avatarUrl: string | null;
  /** Rating courant, pour situer la joueuse au classement général. */
  rating: number;
  /** Variation de rating cumulée sur la fenêtre (peut être négative). */
  delta: number;
  matches: number;
  wins: number;
  losses: number;
  rank: number;
};

/** Saison (league) mise en avant sur le classement. */
export type LeaderboardSeason = {
  leagueId: string;
  name: string;
  slug: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
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
  /**
   * Chaîne Twitch déclarée par la joueuse (`user_metadata.twitch`), ou à
   * défaut celle renseignée par sa capitaine sur une fiche de roster
   * (`team_members.twitch`). Handle nu ou URL — le lien se construit à
   * l'affichage via `utils/social/profileHandles.ts`. `null` = non déclarée.
   */
  twitch: string | null;
  /**
   * `true` quand la joueuse n'a aucune ligne `player_ratings` : elle est sur un
   * roster mais n'a pas encore joué de match classé.
   *
   * Sa fiche existe quand même — nom, avatar, Twitch, palmarès — mais les
   * chiffres ci-dessous n'ont AUCUN sens et ne doivent pas être affichés. Ils
   * valent 0 pour garder le type simple, pas parce qu'ils sont mesurés : lire
   * `rating: 0` comme un vrai classement afficherait « 0 » à quelqu'un qui n'a
   * simplement jamais joué.
   */
  unrated: boolean;
  rating: number;
  rd: number;
  volatility: number;
  peakRating: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  /** `null` pour une joueuse non classée : elle n'a pas de rang, elle n'en a pas « le dernier ». */
  rank: number | null;
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

// ---------------------------------------------------------------------------
// Badges / palmarès / historique de saison — dérivés par le réducteur PUR
// utils/profile/achievements.ts. Aucun accès DB : ces shapes décrivent la
// sortie exposée sur le profil public.
// ---------------------------------------------------------------------------

/** Niveau (rareté) d'un badge de profil. */
export type ProfileBadgeTier = 'bronze' | 'silver' | 'gold' | 'platinum';

/** Badge dérivé du parcours d'un joueur. */
export type ProfileBadge = {
  key: string; // identifiant stable (ex: 'champion', 'peak_elite')
  label: string; // libellé FR court
  description: string; // phrase FR
  tier: ProfileBadgeTier | null;
};

/** Placement final d'une équipe dans un tournoi (palmarès). */
export type ProfilePlacement = {
  tournamentId: string;
  tournamentName: string | null;
  tournamentSlug: string | null;
  teamId: string;
  teamName: string | null;
  rank: number; // rang final dans le tournoi
  date: string | null; // date du tournoi (ISO) si connue
};

/** Participation d'un joueur à une saison de league. */
export type ProfileSeason = {
  leagueId: string;
  leagueName: string | null;
  leagueSlug: string | null;
  teamId: string;
  teamName: string | null;
  rank: number | null; // rang dans la league
  points: number;
};

/** Bloc "achievements" du profil public. */
export type ProfileAchievements = {
  badges: ProfileBadge[];
  palmares: ProfilePlacement[];
  seasons: ProfileSeason[];
};

/** Réponse `GET /api/players/[userId]/profile`. */
export type PlayerProfileResponse = {
  player: PlayerProfileCore;
  history: PlayerProfileHistoryPoint[];
  recentMatches: PlayerProfileRecentMatch[];
  h2h: PlayerProfileH2H[];
  // Badges / palmarès / historique de saison, dérivés par le réducteur pur
  // utils/profile/achievements.ts et branchés dans readPlayerProfile.ts.
  achievements: ProfileAchievements;
};
