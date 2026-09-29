// features/admin/matches/service/lineup.ts — feuille de match côté
// ORGANISATION : lecture des deux feuilles, validation à la place d'une
// équipe injoignable, réouverture (seul geste qui défige une feuille).
//
// Une feuille validée par l'organisation porte `validated_by_kind = 'admin'`
// : la distinction reste lisible en cas de litige. Règles d'éligibilité et
// d'ouverture : utils/matches/lineup.

import { LegacyAdminError } from '@/utils/admin/errors';
import type { ServiceContext } from '@/utils/admin/serviceContext';
import { isValidUUID } from '@/utils/apiHelpers';
import {
  eligibleForLineup,
  lineupOpenState,
  type LineupStatus,
  validateLineup,
} from '@/utils/matches/lineup';
import type { Audited } from '../../_shared/audited';
import * as repo from '../repository/lineup';

type Raw = Record<string, unknown>;

async function loadMatch(ctx: ServiceContext, matchId: string) {
  const match = await repo.getMatchForLineup(ctx.db, ctx.tenantId, matchId);
  if (!match) throw new LegacyAdminError(404, 'Match introuvable.');
  const teamIds = [match.team1_id, match.team2_id].filter(
    (t): t is string => !!t
  );
  return { match, teamIds };
}

export async function getLineups(ctx: ServiceContext, matchId: string) {
  const { match, teamIds } = await loadMatch(ctx, matchId);
  const { headers, picked, teams } = await repo.readLineupSheets(
    ctx.db,
    ctx.tenantId,
    matchId,
    teamIds
  );

  const headerByTeam = new Map(headers.map((h) => [h.team_id, h]));
  const nameByTeam = new Map(teams.map((t) => [t.id, t.name]));

  return {
    match: {
      id: match.id,
      scheduledAt: match.scheduled_at,
      status: match.status,
    },
    lineups: teamIds.map((teamId) => {
      const h = headerByTeam.get(teamId);
      const open = lineupOpenState(match, teamId);
      return {
        teamId,
        teamName: nameByTeam.get(teamId) ?? null,
        open: open.open,
        closedReason: open.open ? null : open.reason,
        status: (h?.status as LineupStatus) ?? 'draft',
        validatedAt: h?.validated_at ?? null,
        validatedByKind: h?.validated_by_kind ?? null,
        players: picked.filter((p) => p.team_id === teamId),
      };
    }),
  };
}

/** POST — `{ teamId, starters?, reopen? }`. */
export async function actOnLineup(
  ctx: ServiceContext,
  staffUserId: string,
  matchId: string,
  body: Raw
): Promise<Audited<unknown>> {
  const { match, teamIds } = await loadMatch(ctx, matchId);
  const { starters, reopen } = body;
  const teamId = String(body.teamId || '');
  if (!isValidUUID(teamId) || !teamIds.includes(teamId)) {
    throw new LegacyAdminError(400, 'teamId absent ou étranger à ce match.');
  }

  // Rouvrir : réservé au staff — une composition qu'une équipe pourrait
  // réécrire après coup ne prouverait rien.
  if (reopen === true) {
    const { error } = await repo.reopenLineup(ctx.db, matchId, teamId);
    if (error) {
      ctx.logger.error('[admin/lineup] reopen error', error);
      throw new LegacyAdminError(500, 'Échec de la réouverture.');
    }
    return {
      result: { status: 'draft' },
      audit: {
        action: 'reopen_match_lineup',
        entity_type: 'match',
        entity_id: matchId,
        payload: { team_id: teamId },
      },
    };
  }

  // Le check-in reste la porte : une équipe absente relève du forfait.
  const open = lineupOpenState(match, teamId);
  if (!open.open) {
    throw new LegacyAdminError(
      409,
      open.reason === 'awaiting_checkin'
        ? "Cette équipe n'a pas fait son check-in."
        : 'La feuille est close pour ce match.',
      { code: open.reason }
    );
  }

  const eligible = eligibleForLineup(
    await repo.listTeamRoster(ctx.db, ctx.tenantId, teamId)
  );

  const proposed: string[] = Array.isArray(starters)
    ? starters.map((v: unknown) => String(v))
    : (await repo.listPickedUserIds(ctx.db, ctx.tenantId, matchId, teamId))
        .map((p) => p.user_id)
        .filter((id): id is string => !!id);

  const check = validateLineup(
    proposed,
    eligible.map((m) => m.user_id as string)
  );
  if (!check.ok) {
    throw new LegacyAdminError(400, 'Composition invalide.', {
      code: check.error,
    });
  }

  if (Array.isArray(starters)) {
    const byUserId = new Map(eligible.map((m) => [m.user_id as string, m]));
    const { error: insErr } = await repo.replaceParticipants(
      ctx.db,
      ctx.tenantId,
      matchId,
      teamId,
      check.starters.map((uid) => {
        const m = byUserId.get(uid);
        return {
          tenant_id: ctx.tenantId,
          match_id: matchId,
          tournament_id: match.tournament_id ?? null,
          team_id: teamId,
          user_id: uid,
          battle_tag: m?.battle_tag ?? null,
          role: m?.role ?? null,
          // TITULAIRE PAR CONSTRUCTION : `check.starters` est la composition
          // DÉCLARÉE. Recopier `is_substitute` du roster excluait du vote MVP
          // une remplaçante de roster qui a démarré le match. `role` garde la
          // valeur du roster : il décrit la PERSONNE, pas ce match-ci.
          is_substitute: false,
        };
      })
    );
    if (insErr) {
      ctx.logger.error('[admin/lineup] insert participants error', insErr);
      throw new LegacyAdminError(500, "Échec de l'enregistrement.");
    }
  }

  const nowIso = new Date().toISOString();
  const { error: upErr } = await repo.upsertLineupHeader(ctx.db, {
    tenant_id: ctx.tenantId,
    match_id: matchId,
    team_id: teamId,
    status: 'validated',
    validated_by: staffUserId,
    validated_by_kind: 'admin',
    validated_at: nowIso,
    updated_at: nowIso,
  });
  if (upErr) {
    ctx.logger.error('[admin/lineup] upsert header error', upErr);
    throw new LegacyAdminError(500, 'Échec de la validation.');
  }

  return {
    result: {
      status: 'validated',
      validatedByKind: 'admin',
      validatedAt: nowIso,
      starters: check.starters,
    },
    audit: {
      action: 'validate_match_lineup',
      entity_type: 'match',
      entity_id: matchId,
      payload: { team_id: teamId, starters: check.starters.length },
    },
  };
}
