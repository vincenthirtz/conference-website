// features/admin/news/schemas.ts — actualités du tenant (admin).
//
// Le corps d'un article garde sa validation historique (titre + contenu
// requis, le reste transmis tel quel) : le service l'applique.

import { z } from 'zod';
// Imports relatifs : ces schémas sont lus par l'assemblage OpenAPI (Node seul).
import { uuidPathParam } from '../../../utils/admin/pathParams';

const INVALID_ID = 'Missing or invalid ID.';

/** `/api/admin/news/[id]` — un tableau (`?id=a&id=b`) est refusé, comme avant. */
export const NewsIdQuery = z.object({
  id: uuidPathParam(INVALID_ID),
});

/** Corps accepté par POST / PUT (non validé au-delà de titre + contenu). */
export type NewsPayload = {
  title?: string;
  slug?: string;
  tag?: string;
  excerpt?: string;
  content?: string;
  imageUrl?: string;
  status?: 'draft' | 'published';
  publishedAt?: string | null;
};

/** Toutes les colonnes de `news` : ce que renvoyait le `select('*')`. */
export const NEWS_COLUMNS =
  'id, tenant_id, team_id, title, slug, tag, excerpt, content, image_url, status, published_at, author_id, created_at, updated_at' as const;
