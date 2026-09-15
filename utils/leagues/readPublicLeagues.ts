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
import type {
  League,
  PublicLeague,
  PublicLeaguesListResponse,
} from '@/types/leagues';

/** Colonnes exposées publiquement (cf. `PublicLeague` : pas de `tenant_id`). */
export const PUBLIC_LEAGUE_COLUMNS =
  'id, name, slug, description, game, status, start_date, end_date, points_table, is_public, created_at, updated_at';

/**
 * Projection publique d'une ligne `leagues`, champ par champ. Double garde avec
 * `PUBLIC_LEAGUE_COLUMNS` : même si la requête remontait une colonne de trop,
 * elle ne sortirait pas.
 */
export function toPublicLeague(row: League | PublicLeague): PublicLeague {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    game: row.game,
    status: row.status,
    start_date: row.start_date,
    end_date: row.end_date,
    points_table: row.points_table,
    is_public: row.is_public,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Lit la liste des leagues publiques pour un tenant donné.
 *
 * @throws en cas d'erreur DB non récupérable (le handler / getStaticProps
 *   décide comment la traiter).
 */
export async function readPublicLeagues(
  tenantId: string
): Promise<PublicLeaguesListResponse> {
  const { data, error } = await supabaseAdmin
    .from('leagues')
    .select(PUBLIC_LEAGUE_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('is_public', true)
    .neq('status', 'draft')
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('[readPublicLeagues] list error', error);
    throw new Error('Failed to load leagues');
  }

  return { leagues: ((data ?? []) as PublicLeague[]).map(toPublicLeague) };
}
