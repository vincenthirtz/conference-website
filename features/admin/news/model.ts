// features/admin/news/model.ts — formes de réponse des fiches actualité,
// lues par le client du site. Types seuls (le service les porte en
// signature) : le site les reçoit sans tirer service ni repository.

import type { Database } from '@/types/database.generated';

/** La ligne telle que le repository la rend (projection sans `comments_closed` ni `deleted_at`). */
export type NewsRow = Omit<
  Database['public']['Tables']['news']['Row'],
  'comments_closed' | 'deleted_at'
>;

/** `PUT /api/admin/news/[id]` : la ligne relue, les slugs à régénérer, et si l'article vient d'être publié. */
export type NewsUpdateResult = {
  row: NewsRow;
  revalidateSlugs: string[];
  justPublished: boolean;
};
