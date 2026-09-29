// features/admin/tournaments/routes/respond.ts — réponse dont le statut
// dépend du geste (201 création / 200 mise à jour, 207 écriture partielle) :
// `defineAdminRoute` ne connaît qu'un statut par méthode.

import type { NextApiResponse } from 'next';
import { RESPONSE_SENT } from '@/utils/admin/defineAdminRoute';
import type { StatusResult } from '../service/common';

export function respond(
  res: NextApiResponse,
  r: StatusResult<unknown>
): typeof RESPONSE_SENT {
  res.status(r.status).json(r.body);
  return RESPONSE_SENT;
}
