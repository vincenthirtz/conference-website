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

/**
 * Les raretés de PLUSIEURS équipes, en deux requêtes au total.
 *
 * POURQUOI UNE VARIANTE EN LOT. `readTeamRarity` coûte deux requêtes par
 * équipe : c'est le bon compromis pour UNE fiche, et un contresens sur un
 * catalogue qui les affiche toutes — quelques dizaines d'équipes y feraient
 * une centaine d'allers-retours à chaque régénération.
 *
 * Le BARÈME reste celui de `teamCardRarity`, appelé ici comme là-bas : c'est
 * tout l'objet de ce module (cf. l'en-tête). Seule la façon d'aller chercher
 * `bestRank` et `rating` change.
 *
 * NE LÈVE JAMAIS, comme sa jumelle : une rareté indisponible retombe sur
 * `common`, et toute équipe demandée ressort de la Map — une absence
 * silencieuse obligerait l'appelant à re-deviner le plancher.
 */
export async function readTeamRarities(
  tenantId: string,
  teamIds: readonly string[]
): Promise<Map<string, TcgRarity>> {
  const out = new Map<string, TcgRarity>();
  const ids = [...new Set(teamIds)];
  for (const id of ids) out.set(id, 'common');
  if (!supabaseAdmin || ids.length === 0) return out;

  try {
    const [ratingsRes, ranksRes] = await Promise.all([
      supabaseAdmin
        .from('team_ratings')
        .select('team_id, rating')
        .eq('tenant_id', tenantId)
        .in('team_id', ids),
      supabaseAdmin
        .from('final_rankings')
        .select('team_id, rank')
        .eq('tenant_id', tenantId)
        .in('team_id', ids),
    ]);

    const ratingByTeam = new Map<string, number | null>();
    for (const row of (ratingsRes.data ?? []) as Array<{
      team_id: string;
      rating: number | null;
    }>) {
      ratingByTeam.set(row.team_id, row.rating ?? null);
    }

    // Le MEILLEUR rang, c'est-à-dire le plus petit : la version unitaire le
    // fait trier par la base (`order` + `limit 1`), ce qu'un `in(...)` ne
    // permet pas par équipe. On réduit donc ici, sur le même critère.
    const bestRankByTeam = new Map<string, number>();
    for (const row of (ranksRes.data ?? []) as Array<{
      team_id: string;
      rank: number | null;
    }>) {
      const rank = row.rank;
      if (typeof rank !== 'number' || !Number.isFinite(rank)) continue;
      const current = bestRankByTeam.get(row.team_id);
      if (current === undefined || rank < current) {
        bestRankByTeam.set(row.team_id, rank);
      }
    }

    for (const id of ids) {
      out.set(
        id,
        teamCardRarity({
          bestRank: bestRankByTeam.get(id) ?? null,
          rating: ratingByTeam.get(id) ?? null,
        })
      );
    }
    return out;
  } catch (err) {
    logger.warn(
      '[tcg] raretés d’équipes indisponibles, repli sur common: %s',
      err instanceof Error ? err.message : String(err)
    );
    return out;
  }
}

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
