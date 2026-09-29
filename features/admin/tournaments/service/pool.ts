// features/admin/tournaments/service/pool.ts — répartition de la liste
// d'attente d'un tournoi regroupé en équipes de 5 (lot 2,
// utils/tournaments/pool.ts).
//
// Les invariants (joueuses en attente de CE tournoi, 5 maximum par équipe,
// inscription / désinscription de l'équipe) sont tenus par les fonctions SQL
// `pool_place` / `pool_unplace` : l'écran peut se tromper, la base non.
//
// ÉQUIPES MIXTES : créées comme les adversaires extérieurs de scrim —
// `is_active = false`, sans capitaine ni membre. Elles jouent sans apparaître
// dans l'annuaire et ne donnent aucun rôle Discord.

import slugify from 'slugify';
import type { ServiceContext } from '@/utils/admin/serviceContext';
import { withDefaultTeamLogo } from '@/utils/teams/defaultTeamLogo';
import { POOL_TEAM_SIZE } from '@/utils/tournaments/pool';
import { proposePoolSquads } from '@/utils/tournaments/poolDistribution';
import type { Audited } from '../../_shared/audited';
import * as tRepo from '../repository/tournaments';
import * as repo from '../repository/teams';
import { poolPostSchema } from '../schemas';
import { fail, failWith } from './common';

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

type EntryRow = {
  id: string;
  display_name: string;
  battle_tag: string;
  origin_team_id: string | null;
  placed_team_id: string | null;
  status: string;
  created_at: string;
};

const PostSchema = poolPostSchema(POOL_TEAM_SIZE);

/** Le tournoi doit exister dans le tenant ET être en inscription regroupée. */
async function loadPooledTournament(ctx: ServiceContext, id: string) {
  const { data } = await tRepo.findTournament(ctx.db, ctx.tenantId, id);
  if (!data) fail(404, 'Tournament not found');
  if (data.pooled_teams !== true) {
    failWith(409, 'This tournament does not use pooled sign-up.', 'NOT_POOLED');
  }
  return data;
}

export async function getPool(ctx: ServiceContext, id: string) {
  const tournament = await loadPooledTournament(ctx, id);
  return readView(ctx, tournament.id);
}

/** Les refus des fonctions SQL portent leur cause dans `hint`. */
function rpcError(
  ctx: ServiceContext,
  error: { message?: string; hint?: string | null }
): never {
  const known: Record<string, [number, string]> = {
    team_full: [409, 'TEAM_FULL'],
    not_waiting: [409, 'NOT_WAITING'],
    not_placed: [409, 'NOT_PLACED'],
    empty: [400, 'INVALID_BODY'],
  };
  const hit = known[error.hint ?? ''];
  if (hit) failWith(hit[0], error.message as string, hit[1]);
  ctx.logger.error(
    '[admin/tournament/pool] rpc error: %s',
    error.message ?? ''
  );
  failWith(500, 'Operation failed.', 'SERVER_ERROR');
}

export async function updatePool(
  ctx: ServiceContext,
  id: string,
  rawBody: unknown
) {
  const tournament = await loadPooledTournament(ctx, id);
  const parsed = PostSchema.safeParse(rawBody ?? {});
  if (!parsed.success) failWith(400, 'Invalid body.', 'INVALID_BODY');
  const body = parsed.data;

  const audited = (payload: Record<string, unknown>) =>
    ({
      entity_type: 'tournament',
      entity_id: tournament.id,
      tournament_id: tournament.id,
      payload: { pool: true, ...payload },
    }) as const;

  if (body.action === 'unplace') {
    const { data, error } = await repo.poolUnplace(ctx.db, {
      p_tenant_id: ctx.tenantId,
      p_tournament_id: tournament.id,
      p_entry_id: body.entryId,
    });
    if (error) rpcError(ctx, error);
    return {
      result: await readView(ctx, tournament.id),
      audit: audited({
        action: 'unplace',
        entryId: body.entryId,
        result: data,
      }),
    } satisfies Audited<unknown>;
  }

  let teamId: string;
  let createdTeamId: string | null = null;

  if (body.action === 'place') {
    // Cible autorisée : une équipe DÉJÀ inscrite à ce tournoi, ou l'équipe
    // d'origine d'une des joueuses placées. Jamais une équipe quelconque.
    const [entered, { data: origins }] = await Promise.all([
      repo.findEntryByTeam(ctx.db, ctx.tenantId, tournament.id, body.teamId),
      repo.poolOrigins(ctx.db, ctx.tenantId, tournament.id, body.entryIds),
    ]);
    const isOrigin = (origins ?? []).some(
      (o) => o.origin_team_id === body.teamId
    );
    if (!entered && !isOrigin) {
      failWith(
        400,
        'Target team is neither entered nor the origin team of a player.',
        'INVALID_TARGET'
      );
    }
    teamId = body.teamId;
  } else {
    const created = await createMixedTeam(ctx, body.teamName, tournament.name);
    if (!created) failWith(500, 'Team creation failed.', 'SERVER_ERROR');
    teamId = created;
    createdTeamId = created;
  }

  const { error } = await repo.poolPlace(ctx.db, {
    p_tenant_id: ctx.tenantId,
    p_tournament_id: tournament.id,
    p_entry_ids: body.entryIds,
    p_team_id: teamId,
    p_team_size: POOL_TEAM_SIZE,
  });
  if (error) {
    // L'équipe mixte n'a été créée que pour ce placement.
    if (createdTeamId) {
      await repo.deleteTeam(ctx.db, ctx.tenantId, createdTeamId);
    }
    rpcError(ctx, error);
  }
  return {
    result: await readView(ctx, tournament.id),
    audit: audited({ action: body.action, entryIds: body.entryIds, teamId }),
  } satisfies Audited<unknown>;
}

async function createMixedTeam(
  ctx: ServiceContext,
  name: string,
  tournamentName: string
): Promise<string | null> {
  const logoUrl = await withDefaultTeamLogo(null, ctx.tenantId);
  const baseSlug =
    slugify(name, { lower: true, strict: true }) ||
    `equipe-${Date.now().toString(36)}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const suffix = `-${Math.random().toString(36).slice(2, 6)}`;
    const { data, error } = await repo.insertTeamReturningId(ctx.db, {
      tenant_id: ctx.tenantId,
      name,
      slug: `${baseSlug}${attempt === 0 ? '' : suffix}`,
      logo_url: logoUrl,
      description: `Équipe formée par le staff pour ${tournamentName}. Les joueuses gardent leur équipe habituelle.`,
      is_active: false,
      is_joinable: false,
      open_for_scrim: false,
    });
    if (!error && data?.id) return data.id;
    const msg = error?.message?.toLowerCase() ?? '';
    if (!msg.includes('duplicate') && !msg.includes('unique')) {
      ctx.logger.error('[admin/tournament/pool] team insert error:', error);
      return null;
    }
  }
  return null;
}

async function readView(
  ctx: ServiceContext,
  tournamentId: string
): Promise<AdminPoolView> {
  const [{ data: entries }, { data: tt }] = await Promise.all([
    repo.poolEntries(ctx.db, ctx.tenantId, tournamentId),
    repo.registeredTeamIds(ctx.db, ctx.tenantId, tournamentId),
  ]);
  const rows = (entries ?? []) as EntryRow[];
  const registered = (tt ?? []).map((r) => r.team_id);

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
    const { data } = await repo.teamsByIds(ctx.db, ctx.tenantId, teamIds);
    for (const t of data ?? []) {
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
