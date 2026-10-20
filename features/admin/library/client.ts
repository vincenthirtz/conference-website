// features/admin/library/client.ts — appels typés de l'onglet « Library » de
// /admin/moderation : les bannissements de la Women's Library (lot 5 de
// docs/PLAN-womens-library.md).
//
//   GET    /api/admin/library/bans?active=true&limit=  → { items, total }
//   POST   /api/admin/library/bans                     → 201 { ban }
//   DELETE /api/admin/library/bans?userId=             → { userId, lifted }
//   DELETE /api/admin/library/bans?id=                 → { userId, lifted }
//
// `?id=` lève UN bannissement : celui d'un compte supprimé (`userId: null`,
// lot 14b), que rien d'autre ne désigne.
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

/** Ce qu'on lève : tous les bannissements d'un compte, ou un bannissement. */
export type LibraryBanLiftTarget = { userId: string } | { id: string };

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
  /**
   * Lève les bannissements EN COURS (l'historique reste) : tous ceux du
   * compte (`userId`), ou ce bannissement-là (`id`, compte supprimé).
   */
  lift: (target: LibraryBanLiftTarget) =>
    adminRequest<LibraryBanLiftResponse>(
      'userId' in target
        ? `${BASE}?userId=${encodeURIComponent(target.userId)}`
        : `${BASE}?id=${encodeURIComponent(target.id)}`,
      { method: 'DELETE', idempotent: true }
    ),
};
