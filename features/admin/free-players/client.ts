// features/admin/free-players/client.ts — appels typés de l'écran staff.
// Les types viennent de `schemas.ts` : ce que la route retourne est ce que
// l'écran reçoit, sans seconde description.

import { adminRequest } from '@/utils/admin/adminHttp';
import type { FreePlayerAdminList, RemoveFreePlayerResult } from './schemas';

const BASE = '/api/admin/free-players';

export const freePlayersClient = {
  list: () => adminRequest<FreePlayerAdminList>(BASE),
  remove: (id: string) =>
    adminRequest<RemoveFreePlayerResult>(
      `${BASE}?id=${encodeURIComponent(id)}`,
      { method: 'DELETE', idempotent: true }
    ),
};
