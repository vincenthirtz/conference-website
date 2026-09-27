// utils/tournaments/pool.ts
//
// INSCRIPTION INDIVIDUELLE REGROUPÉE EN ÉQUIPES (`tournaments.pooled_teams`).
//
// Chaque joueuse s'inscrit seule ; dès que 5 membres d'une même équipe sont
// inscrites, l'équipe est inscrite au tournoi avec elles, les autres attendent
// que le staff les répartisse. Le seuil et l'écriture vivent dans la fonction
// SQL `pool_register` (atomique, cf. database/migrations/
// add_tournament_pooled_teams.sql) ; ce module ne fait que LIRE et mettre en
// forme ce que la joueuse doit voir.
//
// La composition de l'événement (`placed_team_id`) ne touche JAMAIS
// `team_members` : une joueuse placée ailleurs pour la soirée garde sa vraie
// équipe, et son rôle Discord avec.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';

/** 5v5 : la taille d'une équipe d'événement, et le seuil d'inscription auto. */
export const POOL_TEAM_SIZE = 5;

export type PoolEntryStatus = 'waitlist' | 'placed' | 'withdrawn';

export type PoolTeamRef = { id: string; name: string };

export type PoolEntryView = {
  status: PoolEntryStatus;
  displayName: string;
  battleTag: string;
  originTeam: PoolTeamRef | null;
  placedTeam: PoolTeamRef | null;
};

/**
 * Ce que la joueuse voit de son inscription. `teamProgress` n'existe que si
 * elle a déclaré une équipe : « 3 / 5 de ton équipe inscrites » est ce qui
 * pousse à relancer les coéquipières.
 */
export type PoolStatusView = {
  entry: PoolEntryView | null;
  teams: PoolTeamRef[];
  teamProgress: {
    team: PoolTeamRef;
    signedUp: number;
    needed: number;
    teamRegistered: boolean;
  } | null;
};

/** Rôles hors effectif : ils encadrent, ils ne jouent pas. */
const NON_PLAYER_ROLES = new Set(['coach', 'manager']);

/**
 * Les équipes RÉELLES de la joueuse, celles qu'elle peut déclarer comme
 * équipe d'origine. Seulement celles où elle JOUE (ni coach ni manager), et
 * seulement les équipes actives du tenant.
 */
export async function listPlayerTeams(
  tenantId: string,
  userId: string
): Promise<PoolTeamRef[]> {
  if (!supabaseAdmin) return [];
  const { data: memberships, error } = await supabaseAdmin
    .from('team_members')
    .select('team_id, role')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId);
  if (error) {
    logger.error('[pool] listPlayerTeams error: %s', error.message);
    return [];
  }
  const teamIds = [
    ...new Set(
      ((memberships ?? []) as Array<{ team_id: string; role: string | null }>)
        .filter((m) => !(m.role && NON_PLAYER_ROLES.has(m.role)))
        .map((m) => m.team_id)
    ),
  ];
  if (teamIds.length === 0) return [];

  const { data: teams, error: teamsError } = await supabaseAdmin
    .from('teams')
    .select('id, name, deleted_at, is_active')
    .eq('tenant_id', tenantId)
    .in('id', teamIds);
  if (teamsError) {
    logger.error('[pool] listPlayerTeams teams error: %s', teamsError.message);
    return [];
  }
  return (
    (teams ?? []) as Array<{
      id: string;
      name: string;
      deleted_at: string | null;
      is_active: boolean | null;
    }>
  )
    .filter((t) => !t.deleted_at && t.is_active !== false)
    .map((t) => ({ id: t.id, name: t.name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

/** L'inscription de la joueuse et l'avancement de son équipe. */
export async function readPoolStatus(
  tenantId: string,
  tournamentId: string,
  userId: string
): Promise<PoolStatusView> {
  const teams = await listPlayerTeams(tenantId, userId);
  if (!supabaseAdmin) return { entry: null, teams, teamProgress: null };

  const { data: row } = await supabaseAdmin
    .from('tournament_pool_entries')
    .select('status, display_name, battle_tag, origin_team_id, placed_team_id')
    .eq('tenant_id', tenantId)
    .eq('tournament_id', tournamentId)
    .eq('user_id', userId)
    .maybeSingle();

  const r = row as {
    status: PoolEntryStatus;
    display_name: string;
    battle_tag: string;
    origin_team_id: string | null;
    placed_team_id: string | null;
  } | null;
  if (!r || r.status === 'withdrawn') {
    return { entry: null, teams, teamProgress: null };
  }

  const ids = [r.origin_team_id, r.placed_team_id].filter((v): v is string =>
    Boolean(v)
  );
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: teamRows } = await supabaseAdmin
      .from('teams')
      .select('id, name')
      .in('id', ids);
    for (const t of (teamRows ?? []) as PoolTeamRef[]) names.set(t.id, t.name);
  }
  const ref = (id: string | null): PoolTeamRef | null =>
    id ? { id, name: names.get(id) ?? '' } : null;

  const entry: PoolEntryView = {
    status: r.status,
    displayName: r.display_name,
    battleTag: r.battle_tag,
    originTeam: ref(r.origin_team_id),
    placedTeam: ref(r.placed_team_id),
  };

  let teamProgress: PoolStatusView['teamProgress'] = null;
  if (r.origin_team_id) {
    const [{ count }, { data: tt }] = await Promise.all([
      supabaseAdmin
        .from('tournament_pool_entries')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('tournament_id', tournamentId)
        .eq('origin_team_id', r.origin_team_id)
        .neq('status', 'withdrawn'),
      supabaseAdmin
        .from('tournament_teams')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('tournament_id', tournamentId)
        .eq('team_id', r.origin_team_id)
        .maybeSingle(),
    ]);
    teamProgress = {
      team: ref(r.origin_team_id) as PoolTeamRef,
      signedUp: count ?? 0,
      needed: POOL_TEAM_SIZE,
      teamRegistered: Boolean(tt),
    };
  }

  return { entry, teams, teamProgress };
}
