// utils/profile/readHallOfFame.ts
//
// Lecture du palmarès individuel cross-tournois (« hall of fame »).
//
// Pipeline : classements finaux des tournois publics → joueuses ayant
// effectivement joué ces tournois pour l'équipe classée (`match_participants`)
// → agrégation par le réducteur pur `buildHallOfFame` → hydratation des
// identités depuis `player_ratings`.
//
// Best-effort : toute erreur DB renvoie une liste vide plutôt que de faire
// tomber la page.

import { maskBattleTag } from '../battleTag';
import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import {
  buildHallOfFame,
  type HallOfFameEntry,
  type HallOfFamePlacementRow,
} from './buildHallOfFame';

/** Entrée de palmarès enrichie de l'identité de la joueuse. */
export type HallOfFamePlayer = HallOfFameEntry & {
  displayName: string | null;
  battleTag: string | null;
  avatarUrl: string | null;
  /**
   * Équipe du MEILLEUR résultat — pas l'équipe actuelle. Sert de repli
   * d'avatar : afficher le logo du club où la joueuse joue aujourd'hui à côté
   * d'un titre gagné ailleurs raconterait l'inverse de la vérité.
   */
  teamName: string | null;
  teamSlug: string | null;
  teamLogoUrl: string | null;
  /** Position dans le palmarès (1 = plus titrée). */
  position: number;
};

export async function readHallOfFame(
  tenantId: string,
  limit: number
): Promise<HallOfFamePlayer[]> {
  if (!supabaseAdmin) return [];

  // 1) Classements finaux, restreints aux tournois publics — un tournoi privé
  //    ne doit pas fuiter par le palmarès.
  const { data: rankings, error: rankErr } = await supabaseAdmin
    .from('final_rankings')
    .select(
      'tournament_id, team_id, rank, tournament:tournament_id ( id, name, slug, visibility, start_date )'
    )
    .eq('tenant_id', tenantId);

  if (rankErr) {
    logger.error('[readHallOfFame] final_rankings error', rankErr);
    return [];
  }

  type RankingRow = {
    tournament_id: string;
    team_id: string;
    rank: number;
    tournament: {
      id: string;
      name: string | null;
      slug: string | null;
      visibility: string | null;
      start_date: string | null;
    } | null;
  };

  const visible = ((rankings ?? []) as any[])
    .map((r) => ({
      ...r,
      tournament: Array.isArray(r.tournament)
        ? (r.tournament[0] ?? null)
        : (r.tournament ?? null),
    }))
    .filter(
      (r: RankingRow) =>
        r.tournament != null &&
        (r.tournament.visibility == null ||
          r.tournament.visibility === 'public')
    ) as RankingRow[];

  if (visible.length === 0) return [];

  // 2) Qui a joué quoi. `match_participants` est le snapshot immuable des
  //    line-ups : c'est la seule source qui dit qui était là À CE MOMENT, par
  //    opposition au roster courant de l'équipe.
  const tournamentIds = Array.from(
    new Set(visible.map((r) => r.tournament_id))
  );
  const { data: participants, error: partErr } = await supabaseAdmin
    .from('match_participants')
    .select('tournament_id, team_id, user_id')
    .eq('tenant_id', tenantId)
    .in('tournament_id', tournamentIds)
    .not('user_id', 'is', null);

  if (partErr) {
    logger.error('[readHallOfFame] participants error', partErr);
    return [];
  }

  // (tournament_id, team_id) -> joueuses distinctes
  const rosterByTournamentTeam = new Map<string, Set<string>>();
  for (const p of (participants ?? []) as any[]) {
    if (!p.user_id) continue;
    const key = `${p.tournament_id}:${p.team_id}`;
    const set = rosterByTournamentTeam.get(key) ?? new Set<string>();
    set.add(p.user_id as string);
    rosterByTournamentTeam.set(key, set);
  }

  // 3) Identité des équipes classées : nom affiché dans le détail, et logo
  //    servant de repli d'avatar.
  const teamIds = Array.from(new Set(visible.map((r) => r.team_id)));
  const teamById = new Map<
    string,
    { name: string | null; slug: string | null; logoUrl: string | null }
  >();
  if (teamIds.length > 0) {
    const { data: teams } = await supabaseAdmin
      .from('teams')
      .select('id, name, slug, logo_url')
      .eq('tenant_id', tenantId)
      .in('id', teamIds);
    for (const t of (teams ?? []) as any[]) {
      teamById.set(t.id, {
        name: t.name ?? null,
        slug: t.slug ?? null,
        logoUrl: t.logo_url ?? null,
      });
    }
  }

  const rows: HallOfFamePlacementRow[] = [];
  for (const r of visible) {
    const roster = rosterByTournamentTeam.get(
      `${r.tournament_id}:${r.team_id}`
    );
    if (!roster) continue;
    for (const userId of roster) {
      rows.push({
        userId,
        tournamentId: r.tournament_id,
        tournamentName: r.tournament?.name ?? null,
        tournamentSlug: r.tournament?.slug ?? null,
        teamId: r.team_id,
        teamName: teamById.get(r.team_id)?.name ?? null,
        rank: r.rank,
        date: r.tournament?.start_date ?? null,
      });
    }
  }

  if (rows.length === 0) return [];

  const entries = buildHallOfFame(rows, await readMvpCounts(tenantId));

  // 4) Identités. Une joueuse sans ligne `player_ratings` garde son palmarès :
  //    elle a joué, elle a gagné — elle apparaît avec le pseudo qu'on a.
  const candidates = entries.slice(0, limit);
  const { data: identities } = await supabaseAdmin
    .from('player_ratings')
    .select('user_id, display_name, battle_tag, avatar_url')
    .eq('tenant_id', tenantId)
    .in(
      'user_id',
      candidates.map((e) => e.userId)
    );

  const byUser = new Map(
    ((identities ?? []) as any[]).map((row) => [row.user_id as string, row])
  );

  return candidates.map((entry, index) => {
    const identity = byUser.get(entry.userId);
    // `placements` est déjà trié meilleur d'abord : son équipe est celle du
    // résultat qu'on met en avant.
    const bestTeamId = entry.placements[0]?.teamId ?? null;
    const team = bestTeamId ? teamById.get(bestTeamId) : undefined;
    return {
      ...entry,
      displayName: identity?.display_name ?? null,
      battleTag: maskBattleTag(identity?.battle_tag ?? null),
      avatarUrl: identity?.avatar_url ?? null,
      teamName: team?.name ?? null,
      teamSlug: team?.slug ?? null,
      teamLogoUrl: team?.logoUrl ?? null,
      position: index + 1,
    };
  });
}

/** Nombre de MVP de match par joueuse (tie-break du palmarès). */
async function readMvpCounts(tenantId: string): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (!supabaseAdmin) return counts;

  const { data, error } = await supabaseAdmin
    .from('match_mvp_polls')
    .select('winner_member_id')
    .eq('tenant_id', tenantId)
    .not('winner_member_id', 'is', null);

  if (error || !data || data.length === 0) {
    if (error) logger.error('[readHallOfFame] mvp error', error);
    return counts;
  }

  const memberIds = Array.from(
    new Set(data.map((row: any) => row.winner_member_id as string))
  );
  const { data: members } = await supabaseAdmin
    .from('team_members')
    .select('id, user_id')
    .eq('tenant_id', tenantId)
    .in('id', memberIds);

  const memberToUser = new Map(
    ((members ?? []) as any[])
      .filter((m) => m.user_id)
      .map((m) => [m.id as string, m.user_id as string])
  );

  for (const row of data as any[]) {
    const userId = memberToUser.get(row.winner_member_id);
    if (!userId) continue;
    counts.set(userId, (counts.get(userId) ?? 0) + 1);
  }
  return counts;
}
