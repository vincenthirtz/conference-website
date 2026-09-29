// features/admin/cast-members/schemas.ts — fiches des casteuses et casteurs
// de l'espace (page /association, assignation aux matchs).

import { z } from 'zod';
// Imports relatifs : ces schémas sont lus par l'assemblage OpenAPI (Node seul).
import { uuidPathParam } from '../../../utils/admin/pathParams';

const INVALID_ID = 'Missing or invalid ID.';

/** `/api/admin/cast-members/[id]` */
export const CastMemberIdQuery = z.object({
  id: uuidPathParam(INVALID_ID),
});

/** Corps accepté par POST / PATCH (validé champ par champ par le service). */
export type CastMemberPayload = {
  name?: string;
  title?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  twitchUrl?: string | null;
  city?: string | null;
  isActive?: boolean;
  isPromo?: boolean;
  sortOrder?: number;
  authUserId?: string | null;
};

/** Colonnes rendues par la liste admin (pas de `select('*')`). */
export const CAST_MEMBER_LIST_COLUMNS =
  'id, name, title, description, image_url, twitch_url, city, is_active, is_promo, sort_order, auth_user_id, created_at, updated_at' as const;

/** Toutes les colonnes : ce que renvoyaient les `select('*')` / `select()`. */
export const CAST_MEMBER_COLUMNS =
  'id, tenant_id, name, title, description, image_url, twitch_url, city, is_active, is_promo, is_internal, sort_order, auth_user_id, created_at, updated_at, deleted_at' as const;

/** Un caster (rôle staff) tel que proposé à la liaison / l'assignation. */
export type AvailableCaster = {
  /** Nullable au schéma de `staff` ; toujours renseigné en pratique. */
  authUserId: string | null;
  displayName: string | null;
  email: string;
  avatarUrl: string | null;
  linkedCastMemberId: string | null;
  /** Vrai si le caster a déjà un cast_assignment dans la fenêtre demandée. */
  conflictsWithWindow?: boolean;
};
