// features/admin/caster/schemas.ts — cockpit caster web.
//
// zod seul, imports RELATIFS : lu par l'assemblage OpenAPI (Node sans `@/`).

import * as z from 'zod';
import { looseBody } from '../../../utils/admin/pathParams';
import type { StaffLogAction } from '../../../types/staffLogs';

/** Actions acceptées — sous-ensemble strict de StaffLogAction (allowlist). */
export const CASTER_AUDIT_ACTIONS = [
  'caster_match_import',
  'caster_stream_toggle',
  'caster_record_toggle',
  'caster_obs_setup_scenes',
  'caster_poll_toggle',
  'caster_theme_activate',
  // Lot 7 : CRUD des scènes — création / suppression seulement.
  'caster_scene_create',
  'caster_scene_delete',
] as const satisfies readonly StaffLogAction[];

/** Validation réelle, appliquée par le service (400 `INVALID_PAYLOAD`). */
export const CasterAuditSchema = z.object({
  action: z.enum(CASTER_AUDIT_ACTIONS),
  /** Contexte libre mais borné (nom de scène, match importé, état visé…). */
  details: z.record(z.string(), z.unknown()).optional(),
  /** Entité concernée quand elle existe (id de scène, de match, de thème). */
  entity_id: z.string().trim().max(100).optional(),
});

/** POST /api/admin/caster/audit — champs nommés pour la spec. */
export const CasterAuditDoc = looseBody(['action', 'details', 'entity_id']);
