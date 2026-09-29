// features/admin/caster/service.ts
//
// LES DERNIERS MATCHS TERMINÉS, pour que la régie rattache son scrutin MVP à
// l'un d'eux.
//
// POURQUOI PAS `/api/admin/matches/search` : il est gardé par
// `arbitrate_matches`, et un caster n'a que `use_cast_cockpit` (« le caster
// garde EXACTEMENT ce qu'il avait », utils/staffPermissions.ts). Élargir la
// permission pour un menu déroulant aurait été un élargissement de droits
// fait en passant ; on préfère une lecture étroite : matchs TERMINÉS, de quoi
// remplir une liste, rien d'autre.
//
// PAS DE PAGINATION, VOLONTAIREMENT : vingt-cinq lignes couvrent une soirée
// entière ; au-delà, ce n'est plus un choix de régie, c'est de l'archive.

import type { ServiceContext } from '@/utils/admin/serviceContext';
import { AdminError, LegacyAdminError } from '@/utils/admin/errors';
import { logStaffAction } from '@/utils/staffLogs';
import { CasterAuditSchema } from './schemas';
import * as repo from './repository';

const LIMIT = 25;

export type CasterRecentMatch = {
  id: string;
  roundName: string | null;
  team1Name: string | null;
  team2Name: string | null;
  completedAt: string | null;
};

export async function listRecentPlayedMatches(
  ctx: ServiceContext
): Promise<{ matches: CasterRecentMatch[] }> {
  const { rows, error } = await repo.listFinishedMatches(
    ctx.db,
    ctx.tenantId,
    LIMIT
  );
  if (error) {
    ctx.logger.error('[caster/recent-matches] error:', error);
    throw new AdminError(500, 'internal', 'Lecture impossible');
  }

  // Forfaits et byes écartés : il n'y a pas eu de partie, donc personne à
  // élire. Les laisser ne produirait qu'un 409 au clic — même règle que
  // l'ouverture du vote des équipes.
  const played = rows.filter((m) => !m.is_bye && !m.forfeit_team_id);

  const teamIds = Array.from(
    new Set(played.flatMap((m) => [m.team1_id, m.team2_id]).filter(Boolean))
  ) as string[];
  const names = await repo.teamNamesByIds(ctx.db, ctx.tenantId, teamIds);

  return {
    matches: played.map((m) => ({
      id: m.id,
      roundName: m.round_name ?? null,
      team1Name: m.team1_id ? (names.get(m.team1_id) ?? null) : null,
      team2Name: m.team2_id ? (names.get(m.team2_id) ?? null) : null,
      completedAt: m.completed_at ?? null,
    })),
  };
}

/* --------------------------- Journal du cockpit ---------------------------- */

/**
 * POST /caster/audit : journalise une action NOTABLE du cockpit caster web
 * (le cockpit écrit Supabase et OBS depuis le navigateur : rien ne traverse
 * le serveur, donc rien ne pourrait être tracé côté back).
 *
 * Écrit le journal LUI-MÊME (et non via `ctx.audit`) : l'action est choisie
 * par le client dans une allowlist, c'est l'objet même de la route, et
 * l'entrée doit garder sa forme exacte. Best effort : un journal en panne ne
 * casse jamais une action à l'antenne.
 */
export async function recordCasterAction(
  ctx: ServiceContext,
  staffId: string,
  raw: unknown
): Promise<{ ok: true }> {
  const parsed = CasterAuditSchema.safeParse(raw);
  if (!parsed.success) {
    throw new LegacyAdminError(400, 'Invalid payload.', {
      code: 'INVALID_PAYLOAD',
      extra: { details: parsed.error.issues },
    });
  }
  const { action, details, entity_id } = parsed.data;
  try {
    await logStaffAction({
      staff_id: staffId,
      action,
      entity_type: 'caster_cockpit',
      entity_id: entity_id ?? null,
      payload: details ?? null,
      tenant_id: ctx.tenantId,
    });
  } catch (err) {
    ctx.logger.error('[admin/caster/audit] log error', err);
  }
  return { ok: true };
}
