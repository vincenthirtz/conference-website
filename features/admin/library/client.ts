// features/admin/library/client.ts — appels typés de l'onglet « Library » de
// /admin/moderation : les bannissements de la Women's Library (lot 5 de
// docs/PLAN-womens-library.md).
//
//   GET    /api/admin/library/bans?active=true&limit=  → { items, total }
//   POST   /api/admin/library/bans                     → 201 { ban }
//   DELETE /api/admin/library/bans?userId=             → { userId, lifted }
//
// Route gardée `moderate_support` côté conference-api. Ce fichier est PROPRE
// au site : `model.ts` et `schemas.ts`, à côté, sont des copies synchronisées
// (`.api-sync-manifest.json`) qu'on n'édite pas ici.

import { adminRequest } from '@/utils/admin/adminHttp';
import type {
  LibraryBanCreateResponse,
  LibraryBanLiftResponse,
  LibraryBanListResponse,
} from './model';
import type { LibraryBanCreateInput } from './schemas';

const BASE = '/api/admin/library/bans';

/** Plafond de la route (`LibraryBanListQuery.limit`). */
export const LIBRARY_BANS_PAGE_LIMIT = 200;

export const libraryBansClient = {
  /** Bannissements EN COURS, du plus récent au plus ancien. */
  listActive: () =>
    adminRequest<LibraryBanListResponse>(
      `${BASE}?active=true&limit=${LIBRARY_BANS_PAGE_LIMIT}`
    ),
  /** `until` absent ou `null` = définitif. Désigner par `userId` OU `nickname`. */
  ban: (body: LibraryBanCreateInput) =>
    adminRequest<LibraryBanCreateResponse>(BASE, {
      method: 'POST',
      json: body,
      idempotent: true,
    }),
  /** Lève TOUS les bannissements en cours de la joueuse (l'historique reste). */
  lift: (userId: string) =>
    adminRequest<LibraryBanLiftResponse>(
      `${BASE}?userId=${encodeURIComponent(userId)}`,
      { method: 'DELETE', idempotent: true }
    ),
};
