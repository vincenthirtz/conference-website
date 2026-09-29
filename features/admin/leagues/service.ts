// features/admin/leagues/service.ts — règles des ligues côté staff : slug
// unique par tenant, limite du plan, rattachement de tournois, classement.
//
// Le calcul du classement vit dans `utils/leagues/recomputeLeagueStandings.ts`
// (réutilisable hors HTTP) ; ce service ne fait que le déclencher.

import type { ServiceContext } from '@/utils/admin/serviceContext';
import {
  AdminError,
  LegacyAdminError,
  NotFoundError,
} from '@/utils/admin/errors';
import { assertPlanLimit, planLimitBody } from '@/utils/billing/planLimits';
import { recomputeLeagueStandings } from '@/utils/leagues/recomputeLeagueStandings';
import type {
  LeagueStandingPublic,
  LeagueStandingsResponse,
  LeagueTournamentRef,
} from '@/types/leagues';
import type { z } from 'zod';
import * as repo from './repository';
import {
  LeagueCreateBody,
  LeagueLinkTournamentBody,
  LeaguePatchBody,
} from './schemas';

/** Le corps d'erreur historique d'un corps invalide (écrans + intégrations). */
function parseBody<S extends z.ZodType>(schema: S, raw: unknown): z.output<S> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new LegacyAdminError(400, 'Invalid body', {
      code: 'INVALID_BODY',
      extra: { details: parsed.error.flatten() },
    });
  }
  return parsed.data;
}

const slugConflict = () =>
  new LegacyAdminError(409, 'Slug already in use', { code: 'SLUG_CONFLICT' });

export async function listLeagues(ctx: ServiceContext) {
  const { rows, error } = await repo.listLeagues(ctx.db, ctx.tenantId);
  if (error) {
    ctx.logger.error('[admin/leagues] list error', error);
    throw new AdminError(500, 'internal', 'Failed to load leagues');
  }
  return { leagues: rows };
}

export async function createLeague(ctx: ServiceContext, raw: unknown) {
  const body = parseBody(LeagueCreateBody, raw);

  // Limite du plan. Elle était déclarée (`maxLeagues`) et appliquée nulle
  // part : un espace vendu « une ligue » pouvait en créer dix. Le refus est
  // un 402 — ce n'est pas une question de droit, mais de palier — et il nomme
  // le plan qui lève la limite.
  const limit = await assertPlanLimit(ctx.tenantId, 'leagues');
  if (!limit.ok) {
    const { error, code, ...extra } = planLimitBody(limit);
    throw new LegacyAdminError(402, error, { code, extra });
  }

  if (await repo.slugTaken(ctx.db, ctx.tenantId, body.slug)) {
    throw slugConflict();
  }

  const { row, error } = await repo.insertLeague(ctx.db, {
    tenant_id: ctx.tenantId,
    name: body.name,
    slug: body.slug,
    description: body.description ?? null,
    game: body.game ?? null,
    status: 'draft',
    start_date: body.start_date ?? null,
    end_date: body.end_date ?? null,
    is_public: body.is_public ?? false,
    // points_table : si fourni on l'écrit, sinon on laisse le default DB.
    ...(body.points_table !== undefined
      ? { points_table: body.points_table }
      : {}),
  });
  if (error || !row) {
    ctx.logger.error('[admin/leagues] create error', error);
    throw new AdminError(500, 'internal', 'Failed to create league');
  }
  return row;
}

export async function getLeague(ctx: ServiceContext, id: string) {
  const { row, error } = await repo.findLeague(ctx.db, ctx.tenantId, id);
  if (error) {
    ctx.logger.error('[admin/leagues/id] fetch error', error);
    throw new AdminError(500, 'internal', 'Failed to load league');
  }
  if (!row) throw new NotFoundError('League not found');
  return row;
}

export async function updateLeague(
  ctx: ServiceContext,
  id: string,
  raw: unknown
) {
  const body = parseBody(LeaguePatchBody, raw);
  const fields = Object.keys(body);
  if (fields.length === 0) {
    throw new LegacyAdminError(400, 'No fields to update');
  }

  if (
    body.slug !== undefined &&
    (await repo.slugTaken(ctx.db, ctx.tenantId, body.slug, id))
  ) {
    throw slugConflict();
  }

  const { row, error } = await repo.updateLeague(ctx.db, ctx.tenantId, id, {
    updated_at: new Date().toISOString(),
    ...body,
  });
  if (error) {
    ctx.logger.error('[admin/leagues/id] update error', error);
    throw new AdminError(500, 'internal', 'Failed to update league');
  }
  if (!row) throw new NotFoundError('League not found');
  return { row, fields };
}

export async function deleteLeague(ctx: ServiceContext, id: string) {
  const { error } = await repo.deleteLeague(ctx.db, ctx.tenantId, id);
  if (error) {
    ctx.logger.error('[admin/leagues/id] delete error', error);
    throw new AdminError(500, 'internal', 'Failed to delete league');
  }
}

export async function recomputeStandings(
  ctx: ServiceContext,
  leagueId: string
) {
  const result = await recomputeLeagueStandings(ctx.tenantId, leagueId);
  if (!result.ok) {
    if (result.error === 'league_not_found') {
      throw new NotFoundError('League not found');
    }
    throw new AdminError(500, 'internal', result.error);
  }
  return {
    standingsCount: result.standingsCount,
    scrimsCounted: result.scrimsCounted,
  };
}

/**
 * Classement + tournois liés, scopés tenant + id. Contrairement à l'endpoint
 * public /api/leagues/[slug], PAS de filtre is_public/draft : l'admin doit
 * pouvoir consulter une ligue en cours de préparation.
 */
export async function getStandings(
  ctx: ServiceContext,
  leagueId: string
): Promise<LeagueStandingsResponse> {
  const { exists, error: lErr } = await repo.leagueExists(
    ctx.db,
    ctx.tenantId,
    leagueId
  );
  if (lErr) {
    ctx.logger.error('[admin/leagues/standings] league read error', lErr);
    throw new AdminError(500, 'internal', 'Failed to load league');
  }
  if (!exists) throw new NotFoundError('League not found');

  // 1) Classement (noms d'équipes joints à part).
  const { rows: standingRows, error: sErr } = await repo.listStandings(
    ctx.db,
    ctx.tenantId,
    leagueId
  );
  if (sErr) {
    ctx.logger.error('[admin/leagues/standings] standings read error', sErr);
    throw new AdminError(500, 'internal', 'Failed to load standings');
  }
  // `rank` est nullable dans le schéma mais toujours écrit par le recalcul ;
  // `null` trie comme 0, exactement comme avant la migration.
  const standingsRaw = [...standingRows].sort(
    (a, b) => (a.rank ?? 0) - (b.rank ?? 0)
  );

  const teamIds = [...new Set(standingsRaw.map((s) => s.team_id))];
  const teamById = new Map<
    string,
    { name: string; slug: string | null; logo_url: string | null }
  >();
  if (teamIds.length > 0) {
    for (const t of await repo.listTeamsByIds(ctx.db, ctx.tenantId, teamIds)) {
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
      rank: s.rank as number,
    };
  });

  // 2) Tournois liés (nom / slug joints à part).
  const links = await repo.listTournamentLinks(ctx.db, ctx.tenantId, leagueId);
  const linkTournamentIds = [...new Set(links.map((l) => l.tournament_id))];
  const tournamentById = new Map<
    string,
    { name: string | null; slug: string | null }
  >();
  if (linkTournamentIds.length > 0) {
    for (const t of await repo.listTournamentsByIds(
      ctx.db,
      ctx.tenantId,
      linkTournamentIds
    )) {
      tournamentById.set(t.id, { name: t.name ?? null, slug: t.slug ?? null });
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

  return { standings, tournaments };
}

export async function linkTournament(
  ctx: ServiceContext,
  leagueId: string,
  raw: unknown
) {
  const { tournament_id, weight } = parseBody(LeagueLinkTournamentBody, raw);

  const { exists } = await repo.leagueExists(ctx.db, ctx.tenantId, leagueId);
  if (!exists) throw new NotFoundError('League not found');

  if (!(await repo.tournamentExists(ctx.db, ctx.tenantId, tournament_id))) {
    throw new LegacyAdminError(404, 'Tournament not found', {
      code: 'TOURNAMENT_NOT_FOUND',
    });
  }

  const effectiveWeight = weight ?? 1;
  const { row, error } = await repo.upsertTournamentLink(ctx.db, ctx.tenantId, {
    leagueId,
    tournamentId: tournament_id,
    weight: effectiveWeight,
  });
  if (error) {
    ctx.logger.error('[admin/leagues/tournaments] link error', error);
    throw new AdminError(500, 'internal', 'Failed to link tournament');
  }

  return {
    link: row ?? {
      league_id: leagueId,
      tournament_id,
      tenant_id: ctx.tenantId,
      weight: effectiveWeight,
    },
    tournamentId: tournament_id,
    weight: effectiveWeight,
  };
}

export async function unlinkTournament(
  ctx: ServiceContext,
  leagueId: string,
  tournamentId: string
) {
  const { error } = await repo.deleteTournamentLink(
    ctx.db,
    ctx.tenantId,
    leagueId,
    tournamentId
  );
  if (error) {
    ctx.logger.error('[admin/leagues/tournaments] unlink error', error);
    throw new AdminError(500, 'internal', 'Failed to unlink tournament');
  }
}
