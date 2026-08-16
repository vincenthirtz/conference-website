// Shared types for the tournament overview page sub-components
// (pages/admin/tournament/[id].tsx). Extracted verbatim from the page so the
// memoized row/modal components and the page agree on a single definition.

import type { useAdminT } from '@/lib/i18n/useAdminT';
import type { MatchStatus } from '@/types/admin';
import type { RegistrationAnswers as RegistrationAnswerValues } from '@/utils/registrationFields';
import nsAdminTournamentOverview from '@/lib/i18n/locales/admin-fr/adminTournamentOverview';

export type Dict = typeof nsAdminTournamentOverview.fr;

export type Team = {
  id: string;
  name: string;
  logo_url?: string | null;
  is_active?: boolean;
};

export type TournamentTeam = {
  id: string;
  team_id: string;
  seed?: number | null;
  status?: string | null;
  field_values?: RegistrationAnswerValues | null;
  team: Team;
};

export type Stage = {
  id: string;
  name: string;
  stage_type: string | null;
  order_index: number | null;
  is_active: boolean;
  is_public: boolean;
  start_date: string | null;
  end_date: string | null;
};

export type RecentMatch = {
  id: string;
  stage_id: string | null;
  round_number: number | null;
  status: MatchStatus;
  scheduled_at: string | null;
  team1?: { id: string; name: string; logo_url?: string | null } | null;
  team2?: { id: string; name: string; logo_url?: string | null } | null;
  team1_score: number | null;
  team2_score: number | null;
  winner_team_id: string | null;
};

export type Conflict = {
  type: string;
  team_id: string;
  team_name: string;
  match_a: {
    id: string;
    scheduled_at: string;
    estimated_end: string;
    stage_name: string | null;
    round_number: number | null;
  };
  match_b: {
    id: string;
    scheduled_at: string;
    estimated_end: string;
    stage_name: string | null;
    round_number: number | null;
  };
  overlap_minutes: number;
};
