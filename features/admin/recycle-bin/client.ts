// features/admin/recycle-bin/client.ts — corbeille (L10). La liste paginée
// reste sur `useAdminResource` (URL ci-dessous).

import { adminRequest } from '@/utils/admin/adminHttp';

const BASE = '/api/admin/recycle-bin';

export const recycleBinPaths = { list: BASE } as const;

export const recycleBinClient = {
  restore: (body: { id: string; type: string }) =>
    adminRequest(BASE, { method: 'PATCH', json: body, idempotent: true }),
};
