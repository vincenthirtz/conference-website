// utils/tcg/readTeamRarity.ts
//
// La rareté de la carte d'une ÉQUIPE, lue en base.
//
// POURQUOI CE MODULE EXISTE. `teamCardRarity` est un réducteur pur : il attend
// un `bestRank` et un `rating`, et ne sait pas les aller chercher. Les deux
// requêtes qui les fournissent — `team_ratings` et le meilleur
// `final_rankings.rank` — étaient écrites dans l'ouverture de paquet. Les
// recopier dans la page publique d'équipe aurait donné DEUX barèmes jumeaux,
// libres de diverger dès que l'un bouge.
//
// Ce dépôt a déjà payé ce travers plusieurs fois (cf. les listes de plans
// recopiées, et le rapport scrim/match que `economy.ts` IMPORTE au lieu de
// réécrire « 50 »). Une seule fonction sait donc désormais comment la rareté
// d'une équipe se dérive de son parcours.
//
// NE LÈVE JAMAIS. Les deux appelants ont la même exigence pour des raisons
// différentes : perdre une nuance de rareté ne doit pas coûter son paquet à
// quelqu'un, ni faire échouer le rendu d'une page publique. Le repli est
// `common`, qui est aussi le plancher documenté du barème.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import { teamCardRarity, type TcgRarity } from './rarity';

export async function readTeamRarity(
  tenantId: string,
  teamId: string
): Promise<TcgRarity> {
  if (!supabaseAdmin) return 'common';

  try {
    const [ratingRes, ranksRes] = await Promise.all([
      supabaseAdmin
        .from('team_ratings')
        .select('rating')
        .eq('tenant_id', tenantId)
        .eq('team_id', teamId)
        .maybeSingle(),
      supabaseAdmin
        .from('final_rankings')
        .select('rank')
        .eq('tenant_id', tenantId)
        .eq('team_id', teamId)
        .order('rank', { ascending: true })
        .limit(1),
    ]);

    const rating =
      (ratingRes.data as { rating?: number } | null)?.rating ?? null;
    const bestRank =
      ((ranksRes.data ?? []) as Array<{ rank: number }>)[0]?.rank ?? null;

    return teamCardRarity({ bestRank, rating });
  } catch (err) {
    logger.warn(
      '[tcg] rareté d’équipe indisponible, repli sur common: %s',
      err instanceof Error ? err.message : String(err)
    );
    return 'common';
  }
}
