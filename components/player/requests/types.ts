// components/player/requests/types.ts
//
// Types partagés entre la page « Demandes » et ses sous-formulaires extraits.

export type Team = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  country: string | null;
  member_count?: number;
  is_joinable?: boolean;
  /** L'équipe se déclare disponible pour un scrim (cf. /api/teams). */
  open_for_scrim?: boolean;
};

export type TransferTeamMember = {
  user_id: string;
  role: string;
  battle_tag: string | null;
  display_name?: string;
};

export type DesiredRole = 'player' | 'substitute' | 'coach';
export type TransferMode = 'self' | 'propose';
