// features/player/scrims/schemas.ts — scrims côté capitaine / manager
// (réponses aux demandes, grille de disponibilités) — lot P4.
//
// Zod seul. Importé par les routes `pages/api/teams/*` en chemin RELATIF tant
// qu'elles ne sont pas migrées (`@/features/player/` marque une route migrée
// pour playerBoundariesGuard règle 6, la matrice de permissions et les
// contrats), par le registre OpenAPI (lib/apiContracts) et, demain, le client.

import { z } from 'zod';
import { looseUuid } from '../_shared/zod';
import type { ResolvedTeamSkillRating } from '../../../utils/overwatchRank';
import type { TeamReliability } from '../../../utils/teams/reliability';
import type { OpponentMatch } from '../../../utils/teams/opponentMatch';
import type { DirectoryOpening } from '../../../utils/teams/directoryRecruitment';

/**
 * Gestes possibles sur une demande de scrim. Miroir de `SCRIM_ACTIONS`
 * (utils/teams/scrimRequestActions.ts, cœur partagé avec le bot) — l'égalité
 * est vérifiée par tests/unit/playerSchemasP4.test.ts.
 */
export const SCRIM_REQUEST_ACTIONS = [
  'accept',
  'approve',
  'counter',
  'reject',
  'report',
] as const;

/** Corps de POST /api/teams/scrim-requests. */
export const ScrimRequestDecisionBody = z.object({
  demandeId: looseUuid('demandeId invalide.'),
  action: z.enum(SCRIM_REQUEST_ACTIONS, {
    error:
      'Action invalide. Utilise "accept", "counter", "reject" ou "report".',
  }),
  /**
   * `accept` : le créneau retenu ; `counter` : les nouveaux créneaux.
   * Validés contre la négociation EN COURS par `applyScrimRequestAction`
   * (messages propres) : leur forme n'est pas figée ici.
   */
  slot: z.unknown().optional(),
  slots: z.unknown().optional(),
});
export type ScrimRequestDecisionInput = z.infer<
  typeof ScrimRequestDecisionBody
>;

const SLOTS_FORMAT = 'Format de créneaux invalide.';
const SLOT_INVALID = 'Créneau invalide.';

/**
 * Corps de PUT/POST /api/teams/scrim-plannings/{planningId}/availability.
 * Forme seulement : l'appartenance à la grille de la session (horizon, pas,
 * fuseau) est vérifiée par `normalizePlanningSlots`, qui dépend d'elle.
 */
export const PlanningAvailabilityBody = z.object(
  {
    slots: z.array(
      z
        .string({ error: SLOT_INVALID })
        .refine((s) => s.trim().length > 0, SLOT_INVALID),
      { error: SLOTS_FORMAT }
    ),
  },
  { error: SLOTS_FORMAT }
);
export type PlanningAvailabilityInput = z.infer<
  typeof PlanningAvailabilityBody
>;

/* -------------------------------------------------------------------------
 * Lot P13 — module scrims (routes migrées sur defineSubjectRoute)
 * ---------------------------------------------------------------------- */

/**
 * Plafond de créneaux d'une recherche de scrim. Miroir de `MAX_SEARCH_SLOTS`
 * (utils/teams/scrimSearch.ts, qui importe la base : pas d'import ici, ce
 * fichier part dans le bundle client) — égalité vérifiée par
 * tests/unit/playerScrimsModule.test.ts.
 */
export const SCRIM_SEARCH_MAX_SLOTS = 10;

/**
 * Corps de POST /api/teams/scrim-searches. Validé par le SERVICE (message et
 * code historiques `INVALID_BODY`), pas par la route.
 */
export const ScrimSearchBody = z.object({
  slots: z.array(z.string()).min(1).max(SCRIM_SEARCH_MAX_SLOTS),
  format: z.string().trim().max(40).optional().nullable(),
  note: z.string().trim().max(280).optional().nullable(),
});
export type ScrimSearchInput = z.infer<typeof ScrimSearchBody>;

/**
 * Corps de POST /api/player/scrims/{scrimId}/report. Validé par le SERVICE
 * (message et code historiques `INVALID_BODY`).
 */
export const ScrimReportBody = z.object({
  team1Score: z.number().int().min(0).max(99),
  team2Score: z.number().int().min(0).max(99),
});
export type ScrimReportInput = z.infer<typeof ScrimReportBody>;

const PLANNING_ID_INVALID = 'planningId invalide';

/** `?planningId=` des routes `teams/scrim-plannings/[planningId]/*`. */
export const PlanningIdQuery = z.object({
  planningId: looseUuid(PLANNING_ID_INVALID),
});

const SCRIM_ID_INVALID = 'Identifiant de scrim invalide.';

/** `?scrimId=` de POST /api/player/scrims/{scrimId}/report (UUID strict). */
export const ScrimIdQuery = z.object({
  scrimId: z
    .string({ error: SCRIM_ID_INVALID })
    .uuid({ error: SCRIM_ID_INVALID }),
});

/* ---- DTO ---------------------------------------------------------------- */

export type PlanningParty = 'team1' | 'team2' | 'staff';

/** Recherche de scrim d'une équipe (sans `tenant_id` ni `created_by`). */
export type ScrimSearchDto = {
  id: string;
  team_id: string;
  slots: string[];
  format: string | null;
  note: string | null;
  status: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
};

export type ScrimSearchResponse = { search: ScrimSearchDto | null };
export type ScrimSearchSaveResponse = {
  search: ScrimSearchDto | null;
  matchedTeams: number;
};

/** Un scrim de mon équipe (GET /api/player/scrims). */
export type PlayerScrim = {
  id: string;
  name: string | null;
  scheduledDate: string | null;
  status: string;
  ranked: boolean;
  /** Mon équipe est-elle team1 ? Détermine la lecture des scores. */
  isTeam1: boolean;
  opponentName: string | null;
  team1Score: number | null;
  team2Score: number | null;
  winnerTeamId: string | null;
  disputeReason: string | null;
  /** Mon camp a-t-il déjà rapporté un score ? */
  myReport: { team1Score: number; team2Score: number } | null;
};

export type PlayerScrimsResponse = {
  toReport: PlayerScrim[];
  upcoming: PlayerScrim[];
  recent: PlayerScrim[];
  teamId: string | null;
};

export type ScrimReportResponse =
  | { outcome: 'awaiting_opponent'; scrimStatus: string }
  | { outcome: 'disputed'; scrimStatus: 'disputed'; reason: string }
  | {
      outcome: 'completed';
      scrimStatus: 'completed';
      winnerTeamId: string | null;
    };

export type ScrimPlanningSummaryDto = {
  id: string;
  title: string | null;
  game: string | null;
  status: string;
  team1_id: string;
  team2_id: string;
  horizon_start: string;
  horizon_days: number;
  validated_slot: string | null;
  scrim_id: string | null;
};

export type ScrimPlanningEntry = {
  planning: ScrimPlanningSummaryDto;
  myParty: PlanningParty | null;
  myAvailability: string[];
};

export type ScrimPlanningsResponse = { plannings: ScrimPlanningEntry[] };

/** Session de planning vue par une partie (colonnes lues par l'écran). */
export type ScrimPlanningDetailDto = {
  id: string;
  status: string;
  title: string | null;
  team1_id: string;
  team2_id: string;
  horizon_start: string;
  horizon_days: number;
  slot_minutes: number;
  day_start_min: number;
  day_end_min: number;
  timezone: string;
  staff_required: boolean;
  validated_slot: string | null;
};

/** Heatmap sans attribution nominative — sûre à renvoyer côté joueuse. */
export type AnonHeatmap = Record<
  string,
  { count: number; parties: PlanningParty[] }
>;

export type ScrimPlanningDetailResponse = {
  planning: ScrimPlanningDetailDto;
  myParty: PlanningParty;
  mySlots: string[];
  heatmap: AnonHeatmap;
};

export type PlanningSuggestResponse = { slots: string[] };
export type PlanningAvailabilityResponse = {
  success: true;
  mySlots: string[];
};

/** Demande de scrim en attente de MON geste (GET /api/teams/scrim-requests). */
export type PendingScrimRequestDto = {
  id: string;
  user_id: string | null;
  source: string | null;
  status: string;
  comment: string | null;
  payload: unknown;
  created_at: string;
  user: {
    id: string | null;
    email: string | null;
    display_name: string | null;
    discord: string | null;
  } | null;
  scrimNego: {
    slots: string[];
    proposedBy: string | null;
    rounds: number;
    agreedSlot: string | null;
  };
  iAmRequester: boolean;
  myTeamId: string;
};

export type PendingScrimRequestsResponse = {
  demandes: PendingScrimRequestDto[];
};

/* ---- Annuaire connecté (GET /api/player/teams-directory, R4) ------------ */

/**
 * Une équipe d'un AUTRE espace volontaire qui cherche un scrim. Volontairement
 * pauvre : fiabilité, rating et historique se mesurent DANS un espace et ne se
 * comparent pas d'un espace à l'autre. Pas de « proposer un scrim » : on donne
 * leur Discord et le nom de l'espace d'où vient l'annonce.
 */
export type NetworkDirectoryTeam = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  country: string | null;
  discord: string | null;
  skill_average: ResolvedTeamSkillRating | null;
  scrim_search: {
    slots: unknown[];
    format: string | null;
    note: string | null;
    expires_at: string | null;
    common_slots: unknown[];
  };
  /** D'où vient cette annonce. Sans ça, la ligne est inexplicable. */
  tenant: { name: string; slug: string | null };
};

export type DirectoryTeam = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  slug: string | null;
  country: string | null;
  member_count: number;
  is_joinable: boolean;
  is_full: boolean;
  /**
   * Annonce de recrutement ACTIVE (`team_openings`), ou null — le seul signal
   * « cette équipe cherche une joueuse » (`is_joinable` n'est qu'un défaut).
   */
  opening: DirectoryOpening | null;
  /** Rating d'équipe dérivé des matchs (null si jamais noté). */
  rating: number | null;
  /** Niveau moyen DÉCLARÉ (SR Overwatch), repli du facteur « niveau ». */
  skill_average: ResolvedTeamSkillRating | null;
  /** Fiabilité (R10) ; taux `null` sous le seuil d'échantillon. */
  reliability: TeamReliability;
  /** Recherche de scrim vivante, si l'équipe en a une. */
  scrim_search: {
    slots: string[];
    format: string | null;
    note: string | null;
    expires_at: string;
    /** Créneaux communs avec MA propre recherche. */
    common_slots: string[];
  } | null;
  /** Créneaux RÉCURRENTS en commun (rythmes d'équipe, N1). */
  common_rhythm_slots: string[];
  /** Affrontements (match ou scrim) sur les 90 derniers jours. */
  encounters_recent: number;
  /** Score de compatibilité expliqué (N4). Porte le tri de l'annuaire. */
  match: OpponentMatch;
};

export type TeamsDirectoryResponse = {
  teams: DirectoryTeam[];
  networkTeams: NetworkDirectoryTeam[];
  myTeamId: string | null;
  hasOwnSearch: boolean;
  /** Mon niveau moyen : ma team est exclue de la liste, il faut un repère. */
  mySkillAverage: ResolvedTeamSkillRating | null;
};
