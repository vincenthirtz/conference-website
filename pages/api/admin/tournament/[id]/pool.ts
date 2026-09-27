// /api/admin/tournament/[id]/pool — répartition de la liste d'attente d'un
// tournoi regroupé en équipes de 5 (lot 2, cf. utils/tournaments/pool.ts).
//
//   GET  → équipes inscrites avec leurs joueuses, liste d'attente, et une
//          PROPOSITION de répartition (utils/tournaments/poolDistribution.ts)
//   POST { action: 'place', entryIds, teamId }         → placer dans une équipe
//        { action: 'place-new', entryIds, teamName }   → créer une équipe mixte
//        { action: 'unplace', entryId }                → remettre en attente
//
// Les invariants (joueuses en attente de CE tournoi, 5 maximum par équipe,
// inscription / désinscription de l'équipe) sont tenus par les fonctions SQL
// `pool_place` / `pool_unplace`, sur le même verrou que les inscriptions :
// l'écran peut se tromper, la base non.
//
// ÉQUIPES MIXTES : créées comme les adversaires extérieurs de scrim —
// `is_active = false`, sans capitaine ni membre. Elles jouent (bracket,
// matchs) sans apparaître dans l'annuaire, et n'ayant aucun `team_members`,
// elles ne donnent aucun rôle Discord. Les joueuses gardent leur vraie équipe.

import type { NextApiRequest, NextApiResponse } from 'next';
import slugify from 'slugify';
import { z } from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { applyRateLimit } from '@/utils/rateLimit';
import { isValidUUID } from '@/utils/apiHelpers';
import { withDefaultTeamLogo } from '@/utils/teams/defaultTeamLogo';
import { POOL_TEAM_SIZE } from '@/utils/tournaments/pool';
import { proposePoolSquads } from '@/utils/tournaments/poolDistribution';
import { logger } from '@/utils/logger';

export type AdminPoolEntry = {
  id: string;
  displayName: string;
  battleTag: string;
  originTeamId: string | null;
  originTeamName: string | null;
  createdAt: string;
};

export type AdminPoolView = {
  teamSize: number;
  squads: Array<{
    teamId: string;
    teamName: string;
    /** Équipe mixte créée pour l'événement (inactive, hors annuaire). */
    mixed: boolean;
    members: AdminPoolEntry[];
  }>;
  waitlist: AdminPoolEntry[];
  proposal: {
    squads: Array<
      | { kind: 'core'; teamId: string; teamName: string; entryIds: string[] }
      | { kind: 'mixed'; entryIds: string[] }
    >;
    leftoverIds: string[];
  };
};

const PostSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('place'),
    entryIds: z.array(z.string().uuid()).min(1).max(POOL_TEAM_SIZE),
    teamId: z.string().uuid(),
  }),
  z.object({
    action: z.literal('place-new'),
    entryIds: z.array(z.string().uuid()).min(1).max(POOL_TEAM_SIZE),
    teamName: z.string().trim().min(2).max(60),
  }),
  z.object({
    action: z.literal('unplace'),
    entryId: z.string().uuid(),
  }),
]);

type EntryRow = {
  id: string;
  display_name: string;
  battle_tag: string;
  origin_team_id: string | null;
  placed_team_id: string | null;
  status: 'waitlist' | 'placed' | 'withdrawn';
  created_at: string;
};

export default withStaffRoute(handler, { permission: 'manage_tournaments' });

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  res.setHeader('Cache-Control', 'no-store');
  if (
    applyRateLimit(
      req,
      res,
      { max: 120, windowMs: 60_000 },
      'admin-tournament-pool'
    )
  )
    return;

  const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  if (!id || !isValidUUID(id)) {
    return res.status(400).json({ error: 'Invalid tournament ID' });
  }
  const { data: t } = await supabaseAdmin!
    .from('tournaments')
    .select('id, name, pooled_teams')
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();
  const tournament = t as {
    id: string;
    name: string;
    pooled_teams: boolean | null;
  } | null;
  if (!tournament) {
    return res.status(404).json({ error: 'Tournament not found' });
  }
  if (tournament.pooled_teams !== true) {
    return res.status(409).json({
      error: 'This tournament does not use pooled sign-up.',
      code: 'NOT_POOLED',
    });
  }

  if (req.method === 'GET') {
    return res.status(200).json(await readView(ctx.tenantId, tournament.id));
  }

  if (req.method === 'POST') {
    const parsed = PostSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: 'Invalid body.', code: 'INVALID_BODY' });
    }
    const body = parsed.data;

    if (body.action === 'unplace') {
      const { data, error } = await supabaseAdmin!.rpc('pool_unplace', {
        p_tenant_id: ctx.tenantId,
        p_tournament_id: tournament.id,
        p_entry_id: body.entryId,
      });
      if (error) return rpcError(res, error);
      await log(ctx, tournament.id, {
        action: 'unplace',
        entryId: body.entryId,
        result: data,
      });
      return res.status(200).json(await readView(ctx.tenantId, tournament.id));
    }

    let teamId: string;
    let createdTeamId: string | null = null;

    if (body.action === 'place') {
      // Cible autorisée : une équipe DÉJÀ inscrite à ce tournoi, ou l'équipe
      // d'origine d'une des joueuses placées (le noyau joue sous son nom).
      // Jamais une équipe quelconque du site.
      const [{ data: tt }, { data: origins }] = await Promise.all([
        supabaseAdmin!
          .from('tournament_teams')
          .select('team_id')
          .eq('tenant_id', ctx.tenantId)
          .eq('tournament_id', tournament.id)
          .eq('team_id', body.teamId)
          .maybeSingle(),
        supabaseAdmin!
          .from('tournament_pool_entries')
          .select('origin_team_id')
          .eq('tenant_id', ctx.tenantId)
          .eq('tournament_id', tournament.id)
          .in('id', body.entryIds),
      ]);
      const isOrigin = (
        (origins ?? []) as Array<{ origin_team_id: string | null }>
      ).some((o) => o.origin_team_id === body.teamId);
      if (!tt && !isOrigin) {
        return res.status(400).json({
          error:
            'Target team is neither entered nor the origin team of a player.',
          code: 'INVALID_TARGET',
        });
      }
      teamId = body.teamId;
    } else {
      const created = await createMixedTeam(
        ctx.tenantId,
        body.teamName,
        tournament.name
      );
      if (!created) {
        return res
          .status(500)
          .json({ error: 'Team creation failed.', code: 'SERVER_ERROR' });
      }
      teamId = created;
      createdTeamId = created;
    }

    const { error } = await supabaseAdmin!.rpc('pool_place', {
      p_tenant_id: ctx.tenantId,
      p_tournament_id: tournament.id,
      p_entry_ids: body.entryIds,
      p_team_id: teamId,
      p_team_size: POOL_TEAM_SIZE,
    });
    if (error) {
      // L'équipe mixte vient d'être créée pour ce placement : sans lui, elle
      // n'a aucune raison d'exister.
      if (createdTeamId) {
        await supabaseAdmin!
          .from('teams')
          .delete()
          .eq('id', createdTeamId)
          .eq('tenant_id', ctx.tenantId);
      }
      return rpcError(res, error);
    }
    await log(ctx, tournament.id, {
      action: body.action,
      entryIds: body.entryIds,
      teamId,
    });
    return res.status(200).json(await readView(ctx.tenantId, tournament.id));
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

/** Les refus des fonctions SQL portent leur cause dans `hint`. */
function rpcError(
  res: NextApiResponse,
  error: { message?: string; hint?: string | null }
) {
  const hint = error.hint ?? '';
  const known: Record<string, [number, string]> = {
    team_full: [409, 'TEAM_FULL'],
    not_waiting: [409, 'NOT_WAITING'],
    not_placed: [409, 'NOT_PLACED'],
    empty: [400, 'INVALID_BODY'],
  };
  const hit = known[hint];
  if (hit)
    return res.status(hit[0]).json({ error: error.message, code: hit[1] });
  logger.error('[admin/tournament/pool] rpc error: %s', error.message ?? '');
  return res
    .status(500)
    .json({ error: 'Operation failed.', code: 'SERVER_ERROR' });
}

async function log(
  ctx: AuthenticatedStaffContext,
  tournamentId: string,
  payload: Record<string, unknown>
) {
  try {
    await logStaffAction({
      staff_id: ctx.staff.id,
      tenant_id: ctx.tenantId,
      action: 'register_team',
      entity_type: 'tournament',
      entity_id: tournamentId,
      tournament_id: tournamentId,
      payload: { pool: true, ...payload },
    });
  } catch (err) {
    logger.error('[admin/tournament/pool] log error:', err);
  }
}

async function createMixedTeam(
  tenantId: string,
  name: string,
  tournamentName: string
): Promise<string | null> {
  const logoUrl = await withDefaultTeamLogo(null, tenantId);
  const baseSlug =
    slugify(name, { lower: true, strict: true }) ||
    `equipe-${Date.now().toString(36)}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const suffix = `-${Math.random().toString(36).slice(2, 6)}`;
    const { data, error } = await supabaseAdmin!
      .from('teams')
      .insert({
        tenant_id: tenantId,
        name,
        slug: `${baseSlug}${attempt === 0 ? '' : suffix}`,
        logo_url: logoUrl,
        description: `Équipe formée par le staff pour ${tournamentName}. Les joueuses gardent leur équipe habituelle.`,
        is_active: false,
        is_joinable: false,
        open_for_scrim: false,
      })
      .select('id')
      .maybeSingle();
    if (!error && data?.id) return data.id as string;
    const msg = error?.message?.toLowerCase() ?? '';
    if (!msg.includes('duplicate') && !msg.includes('unique')) {
      logger.error('[admin/tournament/pool] team insert error:', error);
      return null;
    }
  }
  return null;
}

async function readView(
  tenantId: string,
  tournamentId: string
): Promise<AdminPoolView> {
  const [{ data: entries }, { data: tt }] = await Promise.all([
    supabaseAdmin!
      .from('tournament_pool_entries')
      .select(
        'id, display_name, battle_tag, origin_team_id, placed_team_id, status, created_at'
      )
      .eq('tenant_id', tenantId)
      .eq('tournament_id', tournamentId)
      .neq('status', 'withdrawn')
      .order('created_at', { ascending: true }),
    supabaseAdmin!
      .from('tournament_teams')
      .select('team_id, created_at')
      .eq('tenant_id', tenantId)
      .eq('tournament_id', tournamentId)
      .order('created_at', { ascending: true }),
  ]);
  const rows = (entries ?? []) as EntryRow[];
  const registered = ((tt ?? []) as Array<{ team_id: string }>).map(
    (r) => r.team_id
  );

  const teamIds = [
    ...new Set([
      ...registered,
      ...rows
        .flatMap((r) => [r.origin_team_id, r.placed_team_id])
        .filter((v): v is string => Boolean(v)),
    ]),
  ];
  const teams = new Map<string, { name: string; is_active: boolean | null }>();
  if (teamIds.length) {
    const { data } = await supabaseAdmin!
      .from('teams')
      .select('id, name, is_active')
      .eq('tenant_id', tenantId)
      .in('id', teamIds);
    for (const t of (data ?? []) as Array<{
      id: string;
      name: string;
      is_active: boolean | null;
    }>) {
      teams.set(t.id, { name: t.name, is_active: t.is_active });
    }
  }

  const toView = (r: EntryRow): AdminPoolEntry => ({
    id: r.id,
    displayName: r.display_name,
    battleTag: r.battle_tag,
    originTeamId: r.origin_team_id,
    originTeamName: r.origin_team_id
      ? (teams.get(r.origin_team_id)?.name ?? null)
      : null,
    createdAt: r.created_at,
  });

  const squads = registered.map((teamId) => ({
    teamId,
    teamName: teams.get(teamId)?.name ?? '',
    mixed: teams.get(teamId)?.is_active === false,
    members: rows
      .filter((r) => r.status === 'placed' && r.placed_team_id === teamId)
      .map(toView),
  }));
  const waitlist = rows.filter((r) => r.status === 'waitlist').map(toView);

  const proposal = proposePoolSquads(
    waitlist.map((w) => ({
      id: w.id,
      originTeamId: w.originTeamId,
      createdAt: w.createdAt,
    })),
    { teamSize: POOL_TEAM_SIZE, registeredTeamIds: registered }
  );

  return {
    teamSize: POOL_TEAM_SIZE,
    squads,
    waitlist,
    proposal: {
      squads: proposal.squads.map((s) =>
        s.kind === 'core'
          ? { ...s, teamName: teams.get(s.teamId)?.name ?? '' }
          : s
      ),
      leftoverIds: proposal.leftoverIds,
    },
  };
}
