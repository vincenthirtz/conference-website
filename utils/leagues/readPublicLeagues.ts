// utils/leagues/readPublicLeagues.ts
//
// Lecture partagée de la liste des leagues publiques (is_public=true,
// status≠draft), triées par `created_at` desc — cohérent avec l'existant.
//
// Extrait depuis `pages/api/leagues/index.ts` afin d'être réutilisable côté
// ISR (`getStaticProps` de `pages/leagues/index.tsx`) SANS appel HTTP au
// build. Le handler API délègue désormais ici et renvoie exactement la même
// shape.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import type { League, LeaguesListResponse } from '@/types/leagues';

/**
 * Lit la liste des leagues publiques pour un tenant donné.
 *
 * @throws en cas d'erreur DB non récupérable (le handler / getStaticProps
 *   décide comment la traiter).
 */
export async function readPublicLeagues(
  tenantId: string
): Promise<LeaguesListResponse> {
  const { data, error } = await supabaseAdmin
    .from('leagues')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_public', true)
    .neq('status', 'draft')
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('[readPublicLeagues] list error', error);
    throw new Error('Failed to load leagues');
  }

  return { leagues: (data ?? []) as League[] };
}
