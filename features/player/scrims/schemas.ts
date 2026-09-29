// features/player/scrims/schemas.ts — scrims côté capitaine / manager
// (réponses aux demandes, grille de disponibilités) — lot P4.
//
// Zod seul. Importé par les routes `pages/api/teams/*` en chemin RELATIF tant
// qu'elles ne sont pas migrées (`@/features/player/` marque une route migrée
// pour playerBoundariesGuard règle 6, la matrice de permissions et les
// contrats), par le registre OpenAPI (lib/apiContracts) et, demain, le client.

import { z } from 'zod';
import { looseUuid } from '../_shared/zod';

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
