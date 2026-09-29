// features/admin/cast-members/client.ts — appels typés de la fiche casteuse
// (lot L10). Les URLs de l'API vivent ICI, plus dans les pages.

import { AdminHttpError, adminRequest } from '@/utils/admin/adminHttp';
import type { CastMemberPayload } from './schemas';
import type { getCastMember, updateCastMember } from './service';

const BASE = '/api/admin/cast-members';

export type CastMember = NonNullable<Awaited<ReturnType<typeof getCastMember>>>;
export type CastMemberUpdated = Awaited<
  ReturnType<typeof updateCastMember>
>['row'];

const byId = (id: string) => `${BASE}/${encodeURIComponent(id)}`;

export const castMembersClient = {
  /**
   * Le service peut répondre `null` (fiche absente sans erreur base) : c'est
   * une erreur de chargement pour l'écran, comme avant la migration — message
   * vide pour que la page affiche son libellé « chargement impossible ».
   */
  get: async (id: string) => {
    const row = await adminRequest<CastMember | null>(byId(id));
    if (!row) throw new AdminHttpError('', 404, null);
    return row;
  },
  update: (id: string, patch: CastMemberPayload) =>
    adminRequest<CastMemberUpdated>(byId(id), {
      method: 'PATCH',
      json: patch,
      idempotent: true,
    }),
  /** URL de création, pour la modale restée sur `useIdempotentMutation`. */
  createUrl: BASE,
};
