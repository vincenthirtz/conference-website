// features/admin/circuit-partners/schemas.ts — candidatures à l'offre
// partenaire des circuits féminins et mixtes (`/api/admin/circuit-partners/**`).
// PORTÉE PLATEFORME : la table n'a pas d'espace, elle en désigne un.

import * as z from 'zod';
import {
  looseBody,
  looseQuery,
  uuidPathParam,
} from '../../../utils/admin/pathParams';

/** Colonnes rendues au staff. L'IP et l'agent utilisateur ne sortent pas : anti-spam. */
export const CIRCUIT_APPLICATION_COLUMNS =
  'id, created_at, updated_at, organization_name, contact_name, email, game, format, season_start, expected_teams, website, community_url, existing_tenant_slug, message, commits_code_of_conduct, commits_safety_lead, status, admin_notes, granted_tenant_id, granted_plan, granted_until, decided_at' as const;

export const CIRCUIT_APPLICATION_STATUSES = [
  'new',
  'reviewing',
  'approved',
  'rejected',
] as const;

export const CircuitApplicationListQuery = looseQuery(['status']);

export const ApplicationIdQuery = z.looseObject({
  id: uuidPathParam('Identifiant invalide.'),
});

const notes = z.string().trim().max(3000);

/** Corps déclaré par la route (champs nommés pour la spec) ; validé par le service. */
export const DecisionDoc = looseBody(['action', 'notes', 'tenantSlug']);

/** Lu par le service : tout échec rend `{ error: 'Décision invalide.', code: 'VALIDATION' }`. */
export const DecisionBody = z.discriminatedUnion('action', [
  z.object({ action: z.literal('review'), notes: notes.optional() }).strict(),
  z.object({ action: z.literal('reject'), notes: notes.min(3) }).strict(),
  z
    .object({
      action: z.literal('approve'),
      tenantSlug: z
        .string()
        .trim()
        .min(2)
        .max(50)
        .regex(/^[a-z0-9-]+$/),
      notes: notes.optional(),
    })
    .strict(),
]);
