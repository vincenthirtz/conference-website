// utils/leagues/readLeagueDetail.ts
//
// Lecture partagée du détail public d'une league : league + standings (join
// teams) + tournois liés (avec poids).
//
// Extrait depuis `pages/api/leagues/[slug].ts` afin d'être réutilisable côté
// ISR (`getStaticProps` de `pages/leagues/[slug].tsx`) SANS appel HTTP au
// build. Le handler API délègue désormais ici et renvoie exactement la même
// shape.
//
// Convention de retour : `null` = league inconnue, non-publique
// (`is_public = false`) ou en `draft` → 404 côté handler / `notFound: true`
// côté page.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import type {
  League,
  LeagueDetailResponse,
  LeagueStandingPublic,
  LeagueTournamentRef,
} from '@/types/leagues';

/**
 * Lit le détail public d'une league pour un tenant donné.
 *
 * @returns la réponse `LeagueDetailResponse` ou `null` si la league est
 *   inconnue / non-publique / en draft (= introuvable publiquement).
 * @throws en cas d'erreur DB non récupérable.
 */
export async function readLeagueDetail(
  slug: string,
  tenantId: string
): Promise<LeagueDetailResponse | null> {
  // 1) League publique.
  const { data: leagueRow, error: lErr } = await supabaseAdmin
    .from('leagues')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('slug', slug)
    .eq('is_public', true)
    .maybeSingle();
  if (lErr) {
    logger.error('[readLeagueDetail] league read error', lErr);
    throw new Error('Failed to load league');
  }
  if (!leagueRow || (leagueRow as League).status === 'draft') {
    return null;
  }
  const league = leagueRow as League;

  // 2) Standings (join teams pour les noms).
  const { data: standingRows } = await supabaseAdmin
    .from('league_standings')
    .select('team_id, points, tournaments_counted, best_rank, rank')
    .eq('tenant_id', tenantId)
    .eq('league_id', league.id);
  const standingsRaw = (standingRows || []) as Array<{
    team_id: string;
    points: number;
    tournaments_counted: number;
    best_rank: number | null;
    rank: number;
  }>;
  standingsRaw.sort((a, b) => a.rank - b.rank);

  const teamIds = [...new Set(standingsRaw.map((s) => s.team_id))];
  const teamById = new Map<
    string,
    { name: string; slug: string | null; logo_url: string | null }
  >();
  if (teamIds.length > 0) {
    const { data: teamRows } = await supabaseAdmin
      .from('teams')
      .select('id, name, slug, logo_url')
      .eq('tenant_id', tenantId)
      .in('id', teamIds);
    for (const t of (teamRows || []) as Array<{
      id: string;
      name: string;
      slug: string | null;
      logo_url: string | null;
    }>) {
      teamById.set(t.id, {
        name: t.name,
        slug: t.slug ?? null,
        logo_url: t.logo_url ?? null,
      });
    }
  }

  const standings: LeagueStandingPublic[] = standingsRaw.map((s) => {
    const t = teamById.get(s.team_id);
    return {
      teamId: s.team_id,
      teamName: t?.name ?? null,
      teamSlug: t?.slug ?? null,
      logoUrl: t?.logo_url ?? null,
      points: s.points,
      tournamentsCounted: s.tournaments_counted,
      bestRank: s.best_rank,
      rank: s.rank,
    };
  });

  // 3) Tournois liés (join tournaments pour name/slug).
  const { data: linkRows } = await supabaseAdmin
    .from('league_tournaments')
    .select('tournament_id, weight')
    .eq('tenant_id', tenantId)
    .eq('league_id', league.id);
  const links = (linkRows || []) as Array<{
    tournament_id: string;
    weight: number | null;
  }>;
  const linkTournamentIds = [...new Set(links.map((l) => l.tournament_id))];
  const tournamentById = new Map<
    string,
    { name: string | null; slug: string | null }
  >();
  if (linkTournamentIds.length > 0) {
    const { data: tRows } = await supabaseAdmin
      .from('tournaments')
      .select('id, name, slug')
      .eq('tenant_id', tenantId)
      .in('id', linkTournamentIds);
    for (const t of (tRows || []) as Array<{
      id: string;
      name: string | null;
      slug: string | null;
    }>) {
      tournamentById.set(t.id, {
        name: t.name ?? null,
        slug: t.slug ?? null,
      });
    }
  }
  const tournaments: LeagueTournamentRef[] = links.map((l) => {
    const t = tournamentById.get(l.tournament_id);
    return {
      id: l.tournament_id,
      name: t?.name ?? null,
      slug: t?.slug ?? null,
      weight: l.weight ?? 1,
    };
  });

  return {
    league,
    standings,
    tournaments,
  };
}
