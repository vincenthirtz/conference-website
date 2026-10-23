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
  if (!supabaseAdmin) return [];
  try {
    const { data, error } = await supabaseAdmin
      .from('final_rankings')
      .select('rank, teams:teams!inner(id, name, short_name, slug, logo_url)')
      .eq('tenant_id', tenantId)
      .eq('tournament_id', tournamentId)
      .lte('rank', 3)
      .order('rank', { ascending: true });
    if (error) {
      logger.error('[loadHomePodium] final_rankings error', error);
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
    logger.error('[loadHomePodium] error', err);
    return [];
  }
}
