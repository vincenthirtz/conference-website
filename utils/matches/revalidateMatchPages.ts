// utils/matches/revalidateMatchPages.ts
//
// Un score saisi doit se voir TOUT DE SUITE sur les pages publiques.
//
// L'accueil et les pages de tournoi sont statiques (ISR, 15 min) : le soir du
// 18/09/2026, la carte « prochain rendez-vous » de l'accueil a continué
// d'annoncer un match déjà joué pendant un quart d'heure, et le classement a
// suivi avec le même retard. La revalidation à la demande efface ce décalage —
// même mécanique que pour les actualités.
//
// TOUT EST BEST-EFFORT : une revalidation qui échoue (chemin jamais généré,
// plateforme qui refuse) ne doit jamais faire échouer l'enregistrement du
// score. On journalise, et l'ISR reprend la main au pire dans 15 minutes.

import type { NextApiResponse } from 'next';
import { supabaseAdmin } from '../supabase';
import { logger } from '../logger';

/**
 * Les chemins à rafraîchir pour un match : l'accueil (carte du prochain
 * rendez-vous), les pages publiques de son tournoi, et sa propre fiche.
 *
 * PURE et exportée pour le test : c'est la liste qui compte, pas l'appel.
 */
export function matchRevalidationPaths(
  matchId: string,
  tournamentRef: string | null
): string[] {
  const paths = ['/', `/match/${matchId}`];
  if (tournamentRef) {
    const base = `/tournament/${tournamentRef}`;
    paths.push(
      base,
      `${base}/matches`,
      `${base}/standings`,
      `${base}/stats`,
      `${base}/bracket`
    );
  }
  return paths;
}

/**
 * Rafraîchit les pages publiques touchées par le score d'un match.
 *
 * `tournamentRef` = le slug s'il existe, sinon l'id : c'est la forme sous
 * laquelle les visiteurs ouvrent la page, donc celle qui est en cache.
 */
export async function revalidateMatchPages(
  res: NextApiResponse,
  opts: { tenantId: string; matchId: string }
): Promise<void> {
  if (typeof res?.revalidate !== 'function') return;

  let tournamentRef: string | null = null;
  try {
    const { data } = await supabaseAdmin!
      .from('matches')
      .select('tournament:tournament_id(id, slug)')
      .eq('tenant_id', opts.tenantId)
      .eq('id', opts.matchId)
      .maybeSingle();
    const tournament = Array.isArray((data as any)?.tournament)
      ? (data as any).tournament[0]
      : (data as any)?.tournament;
    tournamentRef = tournament?.slug || tournament?.id || null;
  } catch (err) {
    logger.warn('[revalidateMatchPages] tournoi illisible', err);
  }

  await Promise.all(
    matchRevalidationPaths(opts.matchId, tournamentRef).map((path) =>
      res.revalidate(path).catch((err: unknown) => {
        logger.warn(`[revalidateMatchPages] ${path} a échoué`, err);
      })
    )
  );
}
