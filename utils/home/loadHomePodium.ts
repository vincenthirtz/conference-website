// utils/home/loadHomePodium.ts
//
// Le podium d'un tournoi pour l'accueil : les trois premières du classement
// FIGÉ (`final_rankings`, écrit par la finalisation admin), affichées sous
// l'annonce de la championne (config/homeChampion).
//
// Vide tant que le tournoi n'est pas finalisé : pas de podium plutôt qu'un
// classement intermédiaire, comme la page publique /tournament/…/podium.
// Ne lève jamais — un podium illisible ne doit pas emporter l'accueil.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import { oneRelation, type Relation } from '@/utils/supabase/relation';
import type { HomeTeam } from '@/utils/home/loadHomeData';

export type HomePodiumEntry = { rank: number; team: HomeTeam };

/** Recopie du `.select()` ci-dessous, embed compris. */
type PodiumRow = {
  rank: number;
  teams: Relation<{
    id: string;
    name: string;
    short_name: string | null;
    slug: string | null;
    logo_url: string | null;
  }>;
};

export async function loadHomePodium(
  tenantId: string,
  tournamentId: string
): Promise<HomePodiumEntry[]> {
  return loadFinalRankings(tenantId, tournamentId, 3);
}

/**
 * Le classement figé d'un tournoi, de la 1re place à `maxRank` (toutes les
 * places sans lui) : l'accueil en prend trois, l'onglet « Équipes » de la page
 * Classement le prend en entier. Mêmes garanties que le podium : vide tant que
 * le tournoi n'est pas finalisé, ne lève jamais.
 */
export async function loadFinalRankings(
  tenantId: string,
  tournamentId: string,
  maxRank?: number
): Promise<HomePodiumEntry[]> {
  if (!supabaseAdmin) return [];
  try {
    let query = supabaseAdmin
      .from('final_rankings')
      .select('rank, teams:teams!inner(id, name, short_name, slug, logo_url)')
      .eq('tenant_id', tenantId)
      .eq('tournament_id', tournamentId);
    if (maxRank !== undefined) query = query.lte('rank', maxRank);
    const { data, error } = await query.order('rank', { ascending: true });
    if (error) {
      logger.error('[loadFinalRankings] final_rankings error', error);
      return [];
    }

    const entries: HomePodiumEntry[] = [];
    for (const row of (data ?? []) as unknown as PodiumRow[]) {
      const t = oneRelation(row.teams);
      if (!t) continue;
      entries.push({
        rank: row.rank,
        team: {
          id: t.id,
          name: t.name,
          shortName: t.short_name,
          slug: t.slug,
          logoUrl: t.logo_url,
        },
      });
    }
    return entries;
  } catch (err) {
    logger.error('[loadFinalRankings] error', err);
    return [];
  }
}
