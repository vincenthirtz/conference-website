// features/admin/demandes/listModel.ts — les types et les règles pures de la
// liste staff des demandes (pages/admin/demandes/index.tsx), sortis de la page
// (règle A7 : elle est gelée en taille) pour être partagés avec ses blocs
// d'affichage (features/admin/demandes/ui/DemandesList*.tsx).
//
// Aucune requête ici : des types, et des fonctions qui lisent une demande.

import type {
  DemandeStatus,
  DemandeType,
} from '@/components/admin/demandes/demandeChips';
import { BATTLE_TAG_REGEX } from '@/utils/teams/roleKind';
import type { DemandePayload } from '@/utils/teams/demandeRows';

export type TournamentMini = {
  id: string;
  name: string;
  slug: string | null;
};

export type TeamMini = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
};

export type UserMini = {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  battle_tag: string | null;
  discord: string | null;
};

export type StaffMini = {
  id: string;
  display_name: string | null;
};

export type Demande = {
  id: string;
  type: DemandeType | string;
  status: DemandeStatus;
  created_at: string;
  updated_at: string | null;
  tournament_id: string | null;
  team_id: string | null;
  user_id: string | null;
  comment: string | null;
  staff_note: string | null;
  source: string | null;
  payload: DemandePayload | null;
  processed_at: string | null;
  processed_by_staff_id: string | null;

  tournament?: TournamentMini | null;
  team?: TeamMini | null;
  user?: UserMini | null;
  processed_by?: StaffMini | null;
};

export type StatusCounts = {
  pending: number;
  approved: number;
  rejected: number;
  cancelled: number;
  total: number;
};

export function sanitizeSearchInput(raw: string) {
  // Strip characters that break PostgREST `or(...)` parsing
  return raw.replace(/[,()*\\]/g, ' ').trim();
}

// Only join / captain_request demandes carry a player BattleTag that gets
// written when the membership is created.
function demandeCarriesBattleTag(d: Demande) {
  return d.type === 'join' || d.type === 'captain_request';
}

// Resolve the BattleTag a demande would write: payload first (join stores
// `user_battle_tag`), falling back to the requester's auth metadata tag.
export function resolveDemandeBattleTag(d: Demande): string | null {
  const fromPayload =
    typeof d.payload?.user_battle_tag === 'string'
      ? d.payload.user_battle_tag
      : null;
  return fromPayload || d.user?.battle_tag || null;
}

// A demande is flagged when it carries a BattleTag slot but the stored tag is
// missing or fails the format check.
export function isBattleTagFlagged(d: Demande): boolean {
  if (!demandeCarriesBattleTag(d)) return false;
  const tag = resolveDemandeBattleTag(d);
  return !tag || !BATTLE_TAG_REGEX.test(tag.trim());
}
