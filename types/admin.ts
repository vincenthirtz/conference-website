// types/admin.ts
// Types centralisés pour l'admin (tournois, équipes, stages, matchs).
// Importez ces types dans les pages et API admin au lieu de les redéfinir.

import type { RegistrationField } from '@/utils/registrationFields';

/* -----------------------------------------------------------
 * Staff
 * ---------------------------------------------------------*/

// NB: 'manager' a été retiré des rôles staff (tier inutilisé). NE PAS confondre
// avec le rôle de TEAM 'manager' (utils/teamRoles.ts / team_members.role), qui
// reste valide et n'a rien à voir avec l'accès back-office.
export type StaffRole = 'owner' | 'admin' | 'caster';

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
  roster_locked_at: string | null;
  timezone: string | null;
  // Libellé court de format (texte libre) affiché sur la carte FORMAT publique.
  // Distinct de `format_type` (structure enum) et `format_details` (texte long).
  format: string | null;
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
  registration_fields: RegistrationField[] | null;
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
  | 'ffa'
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
  settings: import('./stages').StageSettings | null;
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
 * Scrim
 * ---------------------------------------------------------*/

export type ScrimStatus =
  | 'draft'
  | 'scheduled'
  | 'running'
  | 'completed'
  | 'cancelled';

export type Scrim = {
  id: string;
  name: string;
  slug: string | null;
  game: string | null;
  status: ScrimStatus | string;
  team1_id: string | null;
  team2_id: string | null;
  scheduled_date: string | null;
  /** Durée en minutes (agenda admin). NULL → 120 par défaut côté UI. */
  duration_minutes: number | null;
  timezone: string | null;
  is_public: boolean;
  logo_url: string | null;
  banner_url: string | null;
  description: string | null;
  stream_url: string | null;
  source_demande_id: string | null;
  source_planning_id: string | null;
  created_at: string;
  updated_at: string | null;
};

/** Version legere pour les listes */
export type ScrimSummary = {
  id: string;
  name: string;
  slug: string | null;
  status: ScrimStatus | string;
  scheduled_date: string | null;
  team1_id: string | null;
  team2_id: string | null;
};

/* -----------------------------------------------------------
 * Scrim planning (grille de disponibilités partagée)
 * ---------------------------------------------------------*/

export type ScrimPlanningStatus = 'open' | 'validated' | 'cancelled' | 'closed';

/** Une partie qui peint la grille : les deux équipes ou le staff. */
export type ScrimPlanningParty = 'team1' | 'team2' | 'staff';

export type ScrimPlanning = {
  id: string;
  tenant_id: string | null;
  created_by: string | null;
  team1_id: string;
  team2_id: string;
  source_demande_id: string | null;
  scrim_id: string | null;
  title: string | null;
  game: string | null;
  status: ScrimPlanningStatus | string;
  horizon_start: string; // 'YYYY-MM-DD'
  horizon_days: number;
  slot_minutes: number;
  day_start_min: number;
  day_end_min: number;
  timezone: string;
  /** true = le staff doit être présent pour qu'un créneau soit planifiable. */
  staff_required: boolean;
  validated_slot: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
};

export type ScrimPlanningAvailability = {
  id: string;
  planning_id: string;
  party: ScrimPlanningParty;
  user_id: string;
  display_name: string | null;
  slots: string[];
  updated_at: string | null;
};

/** Vue liste allégée (admin + espace capitaine). */
export type ScrimPlanningSummary = {
  id: string;
  title: string | null;
  game: string | null;
  status: ScrimPlanningStatus | string;
  team1_id: string;
  team2_id: string;
  horizon_start: string;
  horizon_days: number;
  validated_slot: string | null;
  scrim_id: string | null;
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
  // Pour les matchs lies a un scrim, tournament_id sera NULL en base ; les
  // consommateurs cote tournoi peuvent continuer a le traiter comme string.
  tournament_id: string;
  scrim_id: string | null;
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
  replay_url: string | null;
  lobby_code: string | null;
  notes: string | null;
  next_match_win_id: string | null;
  next_match_win_slot: 1 | 2 | null;
  next_match_lose_id: string | null;
  next_match_lose_slot: 1 | 2 | null;
  dispute_reason: string | null;
  dispute_opened_by: string | null;
  dispute_opened_at: string | null;
  dispute_resolution: string | null;
  dispute_resolved_by: string | null;
  dispute_resolved_at: string | null;
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
  discord_role_id: string | null;
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
  /** Horodatage de vérif OAuth Battle.net (NULL = non vérifié → source du badge). */
  battle_tag_verified_at?: string | null;
  /** Flag anti-smurf : compte Blizzard vérifié ≠ tag roster (à investiguer). */
  battle_tag_mismatch?: boolean;
  /**
   * Pseudo affichable. L'encadrement (coach / manager) n'a pas forcément de
   * BattleTag : c'est ce champ qui identifie la ligne dans ce cas.
   */
  display_name?: string | null;
  /** SR Overwatch déclaré par l'équipe (0-5000, `null` = non déclaré). */
  skill_rating?: number | null;
};
