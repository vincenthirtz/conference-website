// features/admin/pole-members/client.ts — appels typés de la fiche membre de
// pôle (lot L10). Les URLs de l'API vivent ICI, plus dans les pages.

import { AdminHttpError, adminRequest } from '@/utils/admin/adminHttp';
import type { PoleMemberPayload } from './schemas';
import type { getPoleMember, updatePoleMember } from './service';

const BASE = '/api/admin/pole-members';

export type PoleMember = NonNullable<Awaited<ReturnType<typeof getPoleMember>>>;
export type PoleMemberUpdated = Awaited<
  ReturnType<typeof updatePoleMember>
>['row'];

const byId = (id: string) => `${BASE}/${encodeURIComponent(id)}`;

export const poleMembersClient = {
  /**
   * Le service peut répondre `null` (fiche absente sans erreur base) : c'est
   * une erreur de chargement pour l'écran, comme avant la migration — message
   * vide pour que la page affiche son libellé « chargement impossible ».
   */
  get: async (id: string) => {
    const row = await adminRequest<PoleMember | null>(byId(id));
    if (!row) throw new AdminHttpError('', 404, null);
    return row;
  },
  update: (id: string, patch: PoleMemberPayload) =>
    adminRequest<PoleMemberUpdated>(byId(id), {
      method: 'PATCH',
      json: patch,
      idempotent: true,
    }),
  /** URL de création, pour la modale restée sur `useIdempotentMutation`. */
  createUrl: BASE,
};
