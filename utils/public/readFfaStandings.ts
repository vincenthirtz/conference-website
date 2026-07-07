// utils/public/readFfaStandings.ts
//
// Classement public d'un stage FFA (Free-For-All / points-race) d'un tournoi.
// Lit les `lobbies` du stage + leurs `lobby_placements`, joint `teams` pour les
// seuls champs publics non-PII (id, name, short_name, logo_url), puis agrège via
// le util pur `computeFfaStandings`. Renvoie `null` si le tournoi n'a aucun stage
// de type 'ffa'. Le moteur team-vs-team (`matches`) n'est jamais touché.
//
// Lecture service-role (supabaseAdmin) comme les autres readers publics
// (readStandings / readMatches) : les tables lobbies/lobby_placements sont en
// RLS default-deny pour anon, donc la lecture se fait côté serveur.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import {
  computeFfaStandings,
  type FfaTiebreak,
} from '@/utils/ffa/standings';

export type PublicFfaStandingRow = {
  rank: number;
  teamId: string;
  teamName: string | null;
  teamShortName: string | null;
  logoUrl: string | null;
  totalPoints: number;
  lobbiesPlayed: number;
  bestPlacement: number | null;
  firsts: number;
};

export type PublicFfaStandings = {
  stageName: string | null;
  standings: PublicFfaStandingRow[];
};

const FFA_TIEBREAKS: readonly FfaTiebreak[] = [
  'total_points',
  'best_placement',
  'most_firsts',
];

function resolveTiebreak(settings: unknown): FfaTiebreak {
  if (settings && typeof settings === 'object') {
    const raw = (settings as Record<string, unknown>).tiebreak;
    if (typeof raw === 'string' && FFA_TIEBREAKS.includes(raw as FfaTiebreak)) {
      return raw as FfaTiebreak;
    }
  }
  return 'best_placement';
}

/**
 * Classement public d'un stage FFA. Si le tournoi possède plusieurs stages
 * 'ffa', on retient le premier (par created_at). Renvoie `null` s'il n'existe
 * aucun stage FFA ; renvoie `{ stageName, standings: [] }` si le stage existe
 * mais n'a encore aucun résultat saisi.
 */
export async function readPublicFfaStandings(
  tournamentId: string,
  tenantId: string
): Promise<PublicFfaStandings | null> {
  if (!supabaseAdmin) return null;

  // 1) Stage(s) FFA du tournoi (tenant-scoped). Aucun → null.
  const { data: stageRows, error: stageErr } = await supabaseAdmin
    .from('tournament_stages')
    .select('id, name, stage_type, settings, created_at')
    .eq('tenant_id', tenantId)
    .eq('tournament_id', tournamentId)
    .eq('stage_type', 'ffa')
    .order('created_at', { ascending: true });

  if (stageErr) {
    logger.error('[readPublicFfaStandings] stages error', stageErr);
    throw new Error('Failed to load FFA stage');
  }

  const stages = (stageRows ?? []) as Array<{
    id: string;
    name: string | null;
    stage_type: string;
    settings: unknown;
    created_at: string | null;
  }>;

  if (stages.length === 0) return null;

  const stage = stages[0];
  const tiebreak = resolveTiebreak(stage.settings);

  // 2) Lobbies du stage.
  const { data: lobbyRows, error: lobbyErr } = await supabaseAdmin
    .from('lobbies')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('tournament_id', tournamentId)
    .eq('stage_id', stage.id);

  if (lobbyErr) {
    logger.error('[readPublicFfaStandings] lobbies error', lobbyErr);
    throw new Error('Failed to load FFA lobbies');
  }

  const lobbyIds = ((lobbyRows ?? []) as Array<{ id: string }>).map(
    (l) => l.id
  );

  if (lobbyIds.length === 0) {
    return { stageName: stage.name, standings: [] };
  }

  // 3) Placements de ces lobbies.
  const { data: placementRows, error: placementErr } = await supabaseAdmin
    .from('lobby_placements')
    .select('team_id, placement, points')
    .eq('tenant_id', tenantId)
    .in('lobby_id', lobbyIds);

  if (placementErr) {
    logger.error('[readPublicFfaStandings] placements error', placementErr);
    throw new Error('Failed to load FFA placements');
  }

  const placements = (
    (placementRows ?? []) as Array<{
      team_id: string;
      placement: number | null;
      points: number | string | null;
    }>
  ).map((p) => ({
    teamId: p.team_id,
    placement: p.placement === null ? null : Number(p.placement),
    points: p.points === null ? 0 : Number(p.points),
  }));

  if (placements.length === 0) {
    return { stageName: stage.name, standings: [] };
  }

  // 4) Agrégation pure.
  const rows = computeFfaStandings(placements, tiebreak);

  // 5) Jointure des infos publiques d'équipe (batch .in, pas de N+1, pas de PII).
  const teamIds = [...new Set(rows.map((r) => r.teamId))];
  const teamById = new Map<
    string,
    {
      name: string | null;
      short_name: string | null;
      logo_url: string | null;
    }
  >();

  if (teamIds.length > 0) {
    const { data: teamRows, error: teamErr } = await supabaseAdmin
      .from('teams')
      .select('id, name, short_name, logo_url')
      .eq('tenant_id', tenantId)
      .in('id', teamIds);

    if (teamErr) {
      logger.error('[readPublicFfaStandings] teams error', teamErr);
      throw new Error('Failed to load teams');
    }

    for (const t of (teamRows ?? []) as Array<{
      id: string;
      name: string | null;
      short_name: string | null;
      logo_url: string | null;
    }>) {
      teamById.set(t.id, {
        name: t.name ?? null,
        short_name: t.short_name ?? null,
        logo_url: t.logo_url ?? null,
      });
    }
  }

  const standings: PublicFfaStandingRow[] = rows.map((r) => {
    const team = teamById.get(r.teamId);
    return {
      rank: r.rank,
      teamId: r.teamId,
      teamName: team?.name ?? null,
      teamShortName: team?.short_name ?? null,
      logoUrl: team?.logo_url ?? null,
      totalPoints: r.totalPoints,
      lobbiesPlayed: r.lobbiesPlayed,
      bestPlacement: r.bestPlacement,
      firsts: r.firsts,
    };
  });

  return { stageName: stage.name, standings };
}
