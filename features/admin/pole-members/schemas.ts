// features/admin/pole-members/schemas.ts — membres des pôles de
// l'association (page publique /association).

import { z } from 'zod';
// Imports relatifs : ces schémas sont lus par l'assemblage OpenAPI (Node seul).
import { uuidPathParam } from '../../../utils/admin/pathParams';

const INVALID_ID = 'Missing or invalid ID.';

/** `/api/admin/pole-members/[id]` */
export const PoleMemberIdQuery = z.object({
  id: uuidPathParam(INVALID_ID),
});

/** Corps accepté par POST / PATCH (validé champ par champ par le service). */
export type PoleMemberPayload = {
  poleKey?: string;
  name?: string;
  title?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  linkUrl?: string | null;
  isActive?: boolean;
  sortOrder?: number;
};

/** Toutes les colonnes : ce que renvoyait le `select('*')`. */
export const POLE_MEMBER_COLUMNS =
  'id, pole_key, name, title, description, image_url, link_url, is_active, sort_order, created_at, updated_at' as const;
