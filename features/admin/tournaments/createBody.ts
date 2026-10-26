// features/admin/tournaments/createBody.ts
//
// Corps envoyé par l'écran de création d'un tournoi
// (POST /api/admin/tournaments, pages/admin/tournaments/create.tsx).

import type { FirstMapRule } from '@/utils/matches/firstMapRule';

export type CreateTournamentBody = {
  name: string;
  slug?: string | null;
  game?: string | null;
  status?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  format_type?: string | null;
  max_teams?: number | null;
  min_players?: number | null;
  max_players?: number | null;
  solo_mode?: boolean;
  is_public?: boolean;
  is_featured?: boolean;
  logo_url?: string | null;
  banner_url?: string | null;
  /** Règle de la 1re map après le pile ou face (défaut côté API : `imposed`). */
  first_map_rule?: FirstMapRule;
};
