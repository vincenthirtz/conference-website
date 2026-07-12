// components/tournament/landing/types.ts
//
// Types partagés entre la page /tournament/[id] et les sections de la landing.
// Source unique pour éviter toute divergence de forme entre orchestrateur et
// composants.

import type { MatchStatus } from '@/types/admin';

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

export type LandingCaster = {
  id: string;
  name: string;
  title: string | null;
  image_url: string | null;
  twitch_url: string | null;
  city: string | null;
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

/** Liens communautaires (réels — miroir de FloatingSocials / Footer). */
export const COMMUNITY_LINKS = {
  discord: 'https://discord.gg/gERSsjC3Vd',
  twitch: 'https://www.twitch.tv/womens_cup',
  youtube: 'https://www.youtube.com/@owwomenscup',
  instagram: 'https://www.instagram.com/womenscup_asso',
  tiktok: 'https://www.tiktok.com/@ow_womenscup',
} as const;
