// components/tournament/landing/types.ts
//
// Types partagés entre la page /tournament/[id] et les sections de la landing.
// Source unique pour éviter toute divergence de forme entre orchestrateur et
// composants.

import type { MatchStatus } from '@/types/admin';
import { socialUrl } from '@/config/socials';

export type LandingTournament = {
  id: string;
  name: string;
  short_name?: string | null;
  slug?: string | null;
  game?: string | null;
  status: string;
  format?: string | null;
  max_teams?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  /**
   * Instant EXACT du coup d'envoi : l'horodatage du premier match programmé.
   *
   * `start_date` est une DATE nue, que `new Date()` interprète à minuit UTC —
   * soit 2h du matin à Paris. Le compte à rebours de la landing tombait donc à
   * zéro dix-sept heures avant le premier match, et affichait un décompte
   * différent de celui de l'accueil, qui vise le bon instant.
   */
  kickoff_at?: string | null;
  rules_url?: string | null;
  logo_url?: string | null;
  banner_url?: string | null;
};

export type LandingStage = {
  id: string;
  name: string;
  stage_type: string;
  default_match_format?: string | null;
  swiss_rounds?: number | null;
  bracket_format?: string | null;
};

export type LandingTeam = {
  id: string;
  slug?: string | null;
  name: string;
  short_name?: string | null;
  logo_url?: string | null;
};

export type LandingMatch = {
  id: string;
  scheduled_at: string | null;
  completed_at: string | null;
  status: MatchStatus;
  is_bye: boolean | null;
  round_name: string | null;
  round_number: number | null;
  match_format: string | null;
  team1_score: number | null;
  team2_score: number | null;
  team1: LandingTeam | null;
  team2: LandingTeam | null;
  stage: { id: string; name: string; stage_type: string } | null;
};

export type LandingRound = {
  /** `round_number` des matchs ; `0` si la donnée manque. */
  number: number;
  /** `round_name` tel que saisi (« J1 », « Petite finale »…). */
  name: string | null;
  matchCount: number;
  /** `bracket_side` : 'none' pour la saison régulière / les poules. */
  side: 'none' | 'wb' | 'lb' | 'final';
};

export type LandingPartner = {
  id: string;
  name: string;
  category: 'super' | 'major' | 'cultural';
  logoUrl: string | null;
  websiteUrl: string | null;
};

export type LandingLeague = { slug: string; name: string };

/** Statut normalisé utilisé par toute la landing (dérivé côté serveur). */
export type TournamentPhase = 'upcoming' | 'live' | 'finished' | 'cancelled';

/**
 * Liens communautaires. DÉRIVÉS de `config/socials.ts` : c'était auparavant une
 * copie, qu'il fallait penser à mettre à jour en même temps que la barre
 * flottante et le pied de page — trois listes à garder en phase, donc trois
 * occasions de diverger.
 */
export const COMMUNITY_LINKS = {
  discord: socialUrl('discord'),
  twitch: socialUrl('twitch'),
  youtube: socialUrl('youtube'),
  instagram: socialUrl('instagram'),
  tiktok: socialUrl('tiktok'),
  x: socialUrl('x'),
} as const;
