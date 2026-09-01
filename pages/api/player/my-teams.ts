// pages/api/player/my-teams.ts
//
// Console MULTI-ÉQUIPES (lot J4 de docs/PLAN-espace-joueur.md).
//
// Un manager peut encadrer plusieurs équipes depuis le 2026-08-20, et l'espace
// joueur ne lui offrait qu'un SÉLECTEUR : pour savoir si ses trois équipes sont
// prêtes pour la journée, il regardait trois fois le même tableau de bord. À
// six matchs par semaine, c'est le geste qu'il répète le plus.
//
// Une ligne par équipe, et seulement les colonnes qui décident d'une journée :
// prochain match, check-in, feuille de match, effectif contre le minimum,
// demandes en attente. Le tout en un nombre CONSTANT de requêtes (pas une par
// équipe) : cette page est faite pour être rafraîchie souvent.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withSubjectRoute } from '@/utils/subject';
import { getManagedTeams } from '@/utils/teams/managementAccess';
import { CHECKIN_OPEN_MINUTES } from '@/utils/checkin';
import type { TeamPermission } from '@/utils/teamRoles';

import { logger } from '../../../utils/logger';

export type MyTeamRow = {
  team: {
    id: string;
    name: string;
    slug: string | null;
    logoUrl: string | null;
  };
  isCaptain: boolean;
  permissions: TeamPermission[];
  roster: {
    size: number;
    minPlayers: number | null;
    /** Manquants pour atteindre le minimum du prochain tournoi joué. */
    shortfall: number;
  };
  nextMatch: {
    id: string;
    scheduledAt: string | null;
    opponentName: string | null;
    checkedIn: boolean;
    checkinOpensAt: string | null;
    checkinIsOpen: boolean;
    lineupValidated: boolean;
  } | null;
  pendingJoinRequests: number;
};

export type MyTeamsPayload = { teams: MyTeamRow[] };

export default withSubjectRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse<MyTeamsPayload | { error: string }>,
  { subject }
) {
  if (applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'my-teams')) {
    return;
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId, tenantId } = subject;
  const accesses = await getManagedTeams(userId, tenantId);
  if (accesses.length === 0) return res.status(200).json({ teams: [] });

  const teamIds = accesses.map((a) => a.teamId);
  const now = Date.now();
  const cutoffISO = new Date(now - 60 * 60_000).toISOString();

  const orTeams = teamIds
    .map((id) => `team1_id.eq.${id},team2_id.eq.${id}`)
    .join(',');

  const [teamsRes, membersRes, matchesRes, demandesRes] = await Promise.all([
    supabaseAdmin
      .from('teams')
      .select('id, name, slug, logo_url')
      .in('id', teamIds),
    supabaseAdmin
      .from('team_members')
      .select('team_id')
      .eq('tenant_id', tenantId)
      .in('team_id', teamIds),
    supabaseAdmin
      .from('matches')
      .select(
        `id, scheduled_at, status, team1_id, team2_id,
         team1_checked_in_at, team2_checked_in_at,
         team1:team1_id(id, name), team2:team2_id(id, name),
         tournament:tournament_id(min_players)`
      )
      .eq('tenant_id', tenantId)
      .or(orTeams)
      .in('status', ['pending', 'ongoing'])
      .gte('scheduled_at', cutoffISO)
      .order('scheduled_at', { ascending: true })
      .limit(60),
    supabaseAdmin
      .from('demandes')
      .select('team_id')
      .eq('tenant_id', tenantId)
      .eq('type', 'join')
      .eq('status', 'pending')
      .in('team_id', teamIds),
  ]);

  for (const [label, r] of [
    ['teams', teamsRes],
    ['members', membersRes],
    ['matches', matchesRes],
    ['demandes', demandesRes],
  ] as const) {
    if (r.error) logger.error(`[my-teams] ${label} error:`, r.error);
  }

  const teamRows = new Map(
    ((teamsRes.data ?? []) as Record<string, unknown>[]).map((t) => [
      t.id as string,
      t,
    ])
  );

  const rosterSize = new Map<string, number>();
  for (const m of (membersRes.data ?? []) as { team_id: string }[]) {
    rosterSize.set(m.team_id, (rosterSize.get(m.team_id) ?? 0) + 1);
  }

  const pendingJoins = new Map<string, number>();
  for (const d of (demandesRes.data ?? []) as { team_id: string | null }[]) {
    if (!d.team_id) continue;
    pendingJoins.set(d.team_id, (pendingJoins.get(d.team_id) ?? 0) + 1);
  }

  // Premier match à venir PAR ÉQUIPE : la liste est déjà triée, on garde donc
  // la première occurrence rencontrée pour chaque équipe.
  const nextByTeam = new Map<string, Record<string, unknown>>();
  for (const raw of (matchesRes.data ?? []) as Record<string, unknown>[]) {
    for (const teamId of teamIds) {
      if (raw.team1_id !== teamId && raw.team2_id !== teamId) continue;
      if (!nextByTeam.has(teamId)) nextByTeam.set(teamId, raw);
    }
  }

  // Feuilles de match validées, en UNE lecture pour tous les prochains matchs.
  const matchIds = Array.from(nextByTeam.values()).map((m) => m.id as string);
  const validated = new Set<string>();
  if (matchIds.length > 0) {
    const { data, error } = await supabaseAdmin
      .from('match_lineups')
      .select('match_id, team_id')
      .in('match_id', matchIds)
      .eq('status', 'validated');
    if (error) logger.error('[my-teams] lineups error:', error);
    for (const row of (data ?? []) as {
      match_id: string;
      team_id: string;
    }[]) {
      validated.add(`${row.match_id}:${row.team_id}`);
    }
  }

  const teams: MyTeamRow[] = accesses.map((access) => {
    const teamId = access.teamId;
    const row = teamRows.get(teamId);
    const match = nextByTeam.get(teamId) ?? null;

    const size = rosterSize.get(teamId) ?? 0;
    const minPlayers = match
      ? ((unwrap(match.tournament) as { min_players?: number | null } | null)
          ?.min_players ?? null)
      : null;

    let nextMatch: MyTeamRow['nextMatch'] = null;
    if (match) {
      const isTeam1 = match.team1_id === teamId;
      const opponent = unwrap(isTeam1 ? match.team2 : match.team1) as {
        name?: string;
      } | null;
      const checkedInAt = (
        isTeam1 ? match.team1_checked_in_at : match.team2_checked_in_at
      ) as string | null;
      const scheduledAt = (match.scheduled_at as string | null) ?? null;
      const opensAt = scheduledAt
        ? new Date(
            new Date(scheduledAt).getTime() - CHECKIN_OPEN_MINUTES * 60_000
          ).toISOString()
        : null;

      nextMatch = {
        id: match.id as string,
        scheduledAt,
        opponentName: opponent?.name ?? null,
        checkedIn: !!checkedInAt,
        checkinOpensAt: opensAt,
        checkinIsOpen:
          !!opensAt &&
          !!scheduledAt &&
          now >= new Date(opensAt).getTime() &&
          now <= new Date(scheduledAt).getTime(),
        lineupValidated: validated.has(`${match.id as string}:${teamId}`),
      };
    }

    return {
      team: {
        id: teamId,
        name: (row?.name as string) ?? '',
        slug: (row?.slug as string | null) ?? null,
        logoUrl: (row?.logo_url as string | null) ?? null,
      },
      isCaptain: access.isCaptain,
      permissions: access.permissions,
      roster: {
        size,
        minPlayers,
        shortfall:
          typeof minPlayers === 'number' && minPlayers > size
            ? minPlayers - size
            : 0,
      },
      nextMatch,
      pendingJoinRequests: pendingJoins.get(teamId) ?? 0,
    };
  });

  res.setHeader('Cache-Control', 'private, max-age=30');
  return res.status(200).json({ teams });
});

/** Les embeds PostgREST arrivent objet|tableau selon la cardinalité. */
function unwrap(value: unknown): unknown {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}
