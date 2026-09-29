// features/admin/scrims/client.ts — scrims et grilles de scrim (L10).
//
// LES ÉCRITURES RESTENT SUR `useIdempotentMutation` (file hors ligne,
// `BgSyncQueuedError`) : création, report d'agenda, score en direct / final,
// ajout de match, validation / clôture / prolongation de grille, dispos
// staff. Ce module n'en expose que les chemins (`scrimsPaths`). Idem pour les
// listes lues par `useAdminResource` (pagination, UI optimiste de l'agenda).

import { adminRequest } from '@/utils/admin/adminHttp';
import type {
  Scrim,
  ScrimPlanning,
  ScrimPlanningAvailability,
} from '@/types/admin';
import type { Heatmap } from '@/utils/teams/scrimPlanningOverlap';
import type { SlotConflict } from '@/utils/teams/scrimConflicts';

const SCRIMS = '/api/admin/scrims';
const PLANNINGS = '/api/admin/scrim-plannings';
const enc = encodeURIComponent;

export const scrimsPaths = {
  list: SCRIMS,
  calendar: `${SCRIMS}/calendar`,
  byId: (id: string) => `${SCRIMS}/${enc(id)}`,
  result: (id: string) => `${SCRIMS}/${enc(id)}/result`,
  matches: (id: string) => `${SCRIMS}/${enc(id)}/matches`,
  plannings: PLANNINGS,
  planning: (id: string) => `${PLANNINGS}/${enc(id)}`,
  planningAvailability: (id: string) => `${PLANNINGS}/${enc(id)}/availability`,
  planningValidate: (id: string) => `${PLANNINGS}/${enc(id)}/validate`,
} as const;

type TeamRef = { id: string; name: string; logo_url: string | null } | null;

export type ScrimWithTeams = Scrim & {
  // Résultat (colonnes lues par le GET admin, cf. add_scrim_results.sql).
  team1_score?: number | null;
  team2_score?: number | null;
  winner_team_id?: string | null;
  dispute_reason?: string | null;
  team1?: TeamRef;
  team2?: TeamRef;
};

export type ScrimMatch = {
  id: string;
  status: string;
  best_of: number | null;
  match_format: string | null;
  team1_id: string | null;
  team2_id: string | null;
  team1_score: number | null;
  team2_score: number | null;
  winner_team_id: string | null;
  scheduled_at: string | null;
  lobby_code: string | null;
  team1?: TeamRef;
  team2?: TeamRef;
};

export type ScrimPlanningDetail = {
  planning: ScrimPlanning;
  availabilities: ScrimPlanningAvailability[];
  heatmap: Heatmap;
};

export const scrimsClient = {
  get: (id: string) =>
    adminRequest<{ scrim: ScrimWithTeams }>(scrimsPaths.byId(id)),
  matches: (id: string) =>
    adminRequest<{ matches: ScrimMatch[] }>(scrimsPaths.matches(id)),
  update: (id: string, body: Record<string, unknown>) =>
    adminRequest(scrimsPaths.byId(id), {
      method: 'PATCH',
      json: body,
      idempotent: true,
    }),
  remove: (id: string) =>
    adminRequest(scrimsPaths.byId(id), { method: 'DELETE', idempotent: true }),

  planning: (id: string) =>
    adminRequest<ScrimPlanningDetail>(scrimsPaths.planning(id)),
  myPlanningSlots: (id: string) =>
    adminRequest<{ slots: string[] }>(scrimsPaths.planningAvailability(id)),
  /** Lecture (POST pour porter la liste) : conflits des créneaux proposés. */
  planningConflicts: (id: string, slots: string[]) =>
    adminRequest<{ conflicts: Record<string, SlotConflict[]> }>(
      `${PLANNINGS}/${enc(id)}/conflicts`,
      { method: 'POST', json: { slots } }
    ),
};
