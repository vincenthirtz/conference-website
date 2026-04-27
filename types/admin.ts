// types/admin.ts
// Types centralisés pour l'admin (tournois, équipes, stages, matchs).
// Importez ces types dans les pages et API admin au lieu de les redéfinir.

/* -----------------------------------------------------------
 * Staff
 * ---------------------------------------------------------*/

export type StaffRole = 'owner' | 'admin' | 'manager' | 'caster';

export type StaffShape = {
  id: string;
  role: string;
  display_name: string | null;
};

export type StaffProps = {
  staff: StaffShape;
};

/* -----------------------------------------------------------
 * Tournament
 * ---------------------------------------------------------*/

export type TournamentStatus =
  | 'draft'
  | 'published'
  | 'running'
  | 'completed'
  | 'archived';

export type FormatType =
  | 'single_elim'
  | 'double_elim'
  | 'swiss'
  | 'round_robin'
  | 'showmatch';

export type Tournament = {
  id: string;
  name: string;
  slug: string | null;
  game: string | null;
  status: TournamentStatus | string | null;
  start_date: string | null;
  end_date: string | null;
  timezone: string | null;
  format_type: FormatType | string | null;
  max_teams: number | null;
  min_players: number | null;
  max_players: number | null;
  is_public: boolean;
  is_featured: boolean;
  logo_url: string | null;
  banner_url: string | null;
  rules_url: string | null;
  description_info: string | null;
  schedule_details: string | null;
  schedule_rules: string | null;
  format_details: string | null;
  created_at: string;
  updated_at: string | null;
};

/** Version allégée pour les listes et les références */
export type TournamentMini = {
  id: string;
  name: string;
  slug: string | null;
  status?: string | null;
};

/* -----------------------------------------------------------
 * Stage
 * ---------------------------------------------------------*/

export type StageType =
  | 'group'
  | 'bracket'
  | 'swiss'
  | 'round_robin'
  | 'showmatch'
  | 'other';

export type TiebreakerPolicy = 'manual' | 'extra_round' | 'map_diff' | 'seed';

export type Stage = {
  id: string;
  tournament_id: string;
  name: string;
  slug: string | null;
  stage_type: StageType | null;
  order_index: number | null;
  is_active: boolean;
  is_public: boolean;
  start_date: string | null;
  end_date: string | null;
  tiebreaker_policy: TiebreakerPolicy | null;
  settings: any | null;
  created_at: string;
  updated_at: string | null;
};

/** Version allégée pour les listes */
export type StageSummary = {
  id: string;
  name: string;
  stage_type: StageType | null;
  order_index: number | null;
  is_active?: boolean | null;
  is_public?: boolean | null;
  start_date?: string | null;
  end_date?: string | null;
};

/** Version mini pour les références */
export type StageMini = {
  id: string;
  name: string;
  stage_type: StageType | null;
  is_active?: boolean | null;
};

/* -----------------------------------------------------------
 * Match
 * ---------------------------------------------------------*/

export type MatchStatus =
  | 'pending'
  | 'ongoing'
  | 'finished'
  | 'cancelled'
  | 'postponed'
  | 'disputed'
  | 'walkover';

export type BracketSide = 'wb' | 'lb' | 'final' | 'none';

export type Match = {
  id: string;
  tournament_id: string;
  stage_id: string | null;
  stage?: StageSummary | null;
  round_number: number | null;
  status: MatchStatus;
  is_bye: boolean | null;
  best_of: number | null;
  match_format: string | null;
  round_name: string | null;
  bracket_side: BracketSide | null;
  group_key: string | null;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  team1_id: string | null;
  team2_id: string | null;
  team1?: TeamMini | null;
  team2?: TeamMini | null;
  team1_score: number | null;
  team2_score: number | null;
  winner_team_id: string | null;
  forfeit_team_id: string | null;
  stream_url: string | null;
  lobby_code: string | null;
  notes: string | null;
  next_match_win_id: string | null;
  next_match_win_slot: 1 | 2 | null;
  next_match_lose_id: string | null;
  next_match_lose_slot: 1 | 2 | null;
  updated_at: string | null;
};

/* -----------------------------------------------------------
 * Team
 * ---------------------------------------------------------*/

export type TeamRow = {
  id: string;
  name: string;
  slug: string | null;
  short_name: string | null;
  logo_url: string | null;
  banner_url: string | null;
  country: string | null;
  description: string | null;
  twitter: string | null;
  discord: string | null;
  website: string | null;
  is_active: boolean;
  captain_id: string | null;
  created_at: string;
  updated_at: string | null;
};

/** Version mini pour les affichages en contexte match/bracket */
export type TeamMini = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
};

/* -----------------------------------------------------------
 * Team members
 * ---------------------------------------------------------*/

export type TeamMemberRow = {
  id: string;
  team_id: string;
  user_id: string;
  role: string;
  battle_tag?: string | null;
  is_substitute: boolean;
  created_at: string;
};
