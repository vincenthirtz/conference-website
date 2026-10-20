// features/admin/library/accessClient.ts — appels typés de l'ACCÈS à la
// Women's Library, panneau « Accès à la Library » de l'onglet Library de
// /admin/moderation (lot 14c de docs/PLAN-womens-library.md).
//
//   GET /api/admin/library/access          → LibraryAccessResponse
//   PUT /api/admin/library/access          → LibraryAccessResponse (409 si `rev` périmée)
//   GET /api/admin/teams?search=&limit=    → { teams } (recherche d'équipes de l'espace)
//
// `/api/admin/library/access` est gardée `manage_settings` côté
// conference-api ; la recherche d'équipes, `manage_teams` (owner et admin ont
// les deux). Ce fichier est PROPRE au site : `accessModel.ts` et
// `accessSchemas.ts`, à côté, sont des copies synchronisées
// (`.api-sync-manifest.json`) qu'on n'édite pas ici.

import { adminRequest } from '@/utils/admin/adminHttp';
import type { TeamOption } from '../_shared/teamOptions';
import type { LibraryAccessResponse } from './accessModel';
import type { LibraryAccessUpdateInput } from './accessSchemas';

const ACCESS_URL = '/api/admin/library/access';

/** Résultats proposés par la recherche d'équipes. */
export const LIBRARY_ACCESS_TEAM_SEARCH_LIMIT = 8;

export const libraryAccessAdminClient = {
  get: () => adminRequest<LibraryAccessResponse>(ACCESS_URL),
  save: (body: LibraryAccessUpdateInput) =>
    adminRequest<LibraryAccessResponse>(ACCESS_URL, {
      method: 'PUT',
      json: body,
      idempotent: true,
    }),
  /** Équipes NON supprimées de l'espace dont le nom contient `q`. */
  searchTeams: (q: string) =>
    adminRequest<{ teams?: TeamOption[] }>(
      `/api/admin/teams?search=${encodeURIComponent(q)}&limit=${LIBRARY_ACCESS_TEAM_SEARCH_LIMIT}`
    ),
};
