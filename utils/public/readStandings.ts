// utils/public/readStandings.ts
//
// Classement final public d'un tournoi depuis `final_rankings` (join teams).
// Vide si le tournoi n'a pas encore été finalisé. Ne PAS exposer `notes`
// (colonne interne staff).

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';

export type PublicStanding = {
  rank: number;
  teamId: string;
  teamName: string | null;
  teamSlug: string | null;
  logoUrl: string | null;
  prize: string | null;
};

/**
 * Classement final d'un tournoi, trié par rank asc. Renvoie `[]` si aucune
 * ligne `final_rankings` (tournoi non finalisé).
 */
export async function readPublicTournamentStandings(
  tournamentId: string,
  tenantId: string
): Promise<PublicStanding[]> {
  const { data: rankRows, error: rankErr } = await supabaseAdmin
    .from('final_rankings')
    .select('team_id, rank, prize')
    .eq('tenant_id', tenantId)
    .eq('tournament_id', tournamentId);

  if (rankErr) {
    logger.error('[readPublicTournamentStandings] rankings error', rankErr);
    throw new Error('Failed to load standings');
  }

  const rankings = (
    (rankRows ?? []) as Array<{
      team_id: string;
      rank: number;
      prize: string | null;
    }>
  )
    .slice()
    .sort((a, b) => a.rank - b.rank);

  if (rankings.length === 0) return [];

  const teamIds = [...new Set(rankings.map((r) => r.team_id))];
  const teamById = new Map<
    string,
    { name: string | null; slug: string | null; logo_url: string | null }
  >();
  if (teamIds.length > 0) {
    const { data: teamRows, error: teamErr } = await supabaseAdmin
      .from('teams')
      .select('id, name, slug, logo_url')
      .eq('tenant_id', tenantId)
      .in('id', teamIds);
    if (teamErr) {
      logger.error('[readPublicTournamentStandings] teams error', teamErr);
      throw new Error('Failed to load teams');
    }
    for (const t of (teamRows ?? []) as Array<{
      id: string;
      name: string | null;
      slug: string | null;
      logo_url: string | null;
    }>) {
      teamById.set(t.id, {
        name: t.name ?? null,
        slug: t.slug ?? null,
        logo_url: t.logo_url ?? null,
      });
    }
  }

  return rankings.map((r) => {
    const t = teamById.get(r.team_id);
    return {
      rank: r.rank,
      teamId: r.team_id,
      teamName: t?.name ?? null,
      teamSlug: t?.slug ?? null,
      logoUrl: t?.logo_url ?? null,
      prize: r.prize ?? null,
    };
  });
}
