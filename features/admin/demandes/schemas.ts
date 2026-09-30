// features/admin/demandes/schemas.ts — entrées et colonnes des routes staff
// d'une demande (`/api/admin/demandes/[id]`, `…/[id]/notify-captains`).
//
// zod seul, imports RELATIFS : ces schémas sont référencés par la spec
// OpenAPI (lib/apiContracts/admin/features.ts), assemblée par Node sans `@/`.
//
// Le segment s'appelle `id` et non `demandeId` : Next.js refuse deux noms de
// slug différents sur le même segment dynamique (erreur de BUILD seulement).

import * as z from 'zod';
import { uuidPathParam } from '../../../utils/admin/pathParams';

/** Fiche staff d'une demande, relations comprises. */
export const DEMANDE_DETAIL_COLUMNS = `
      id,
      user_id,
      team_id,
      tournament_id,
      type,
      status,
      comment,
      staff_note,
      processed_by_staff_id,
      processed_at,
      source,
      payload,
      created_at,
      updated_at,
      team:teams!demandes_team_id_fkey(id, name, short_name, logo_url),
      tournament:tournaments!demandes_tournament_id_fkey(id, name, slug)
      ` as const;

/** GET /api/admin/demandes/[id] : 400 « Invalid demande id ». */
export const DemandeIdQuery = z.looseObject({
  id: uuidPathParam('Invalid demande id'),
});

/** POST …/[id]/notify-captains : 400 « demandeId invalide. ». */
export const DemandeNotifyQuery = z.looseObject({
  id: uuidPathParam('demandeId invalide.'),
});
