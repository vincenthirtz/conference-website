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
  LeagueScrimRef,
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
    .select(
      'team_id, points, tournaments_counted, scrims_counted, best_rank, rank'
    )
    .eq('tenant_id', tenantId)
    .eq('league_id', league.id);
  const standingsRaw = (standingRows || []) as Array<{
    team_id: string;
    points: number;
    tournaments_counted: number;
    scrims_counted: number | null;
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
      scrimsCounted: s.scrims_counted ?? 0,
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

  // 4) Scrims rattachés (join scrims + noms d'équipes).
  const { data: scrimLinkRows } = await supabaseAdmin
    .from('league_scrims')
    .select('scrim_id, weight')
    .eq('tenant_id', tenantId)
    .eq('league_id', league.id);
  const scrimLinks = (scrimLinkRows || []) as Array<{
    scrim_id: string;
    weight: number | null;
  }>;

  let scrims: LeagueScrimRef[] = [];
  if (scrimLinks.length > 0) {
    const weightByScrim = new Map(
      scrimLinks.map((l) => [l.scrim_id, l.weight ?? 1])
    );
    const { data: scrimRows } = await supabaseAdmin
      .from('scrims')
      .select(
        `id, name, slug, team1_score, team2_score, scheduled_date,
         team1:teams!scrims_team1_id_fkey(name),
         team2:teams!scrims_team2_id_fkey(name)`
      )
      .eq('tenant_id', tenantId)
      .in('id', [...weightByScrim.keys()])
      .eq('status', 'completed')
      .is('deleted_at', null)
      .order('scheduled_date', { ascending: true, nullsFirst: false });

    scrims = (
      (scrimRows || []) as unknown as Array<{
        id: string;
        name: string | null;
        slug: string | null;
        team1_score: number | null;
        team2_score: number | null;
        scheduled_date: string | null;
        team1: { name: string | null } | null;
        team2: { name: string | null } | null;
      }>
    ).map((r) => ({
      id: r.id,
      name: r.name ?? null,
      slug: r.slug ?? null,
      weight: weightByScrim.get(r.id) ?? 1,
      team1Name: r.team1?.name ?? null,
      team2Name: r.team2?.name ?? null,
      team1Score: r.team1_score ?? null,
      team2Score: r.team2_score ?? null,
      scheduledDate: r.scheduled_date ?? null,
    }));
  }

  return {
    league,
    standings,
    tournaments,
    scrims,
  };
}
