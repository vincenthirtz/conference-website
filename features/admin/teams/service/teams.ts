// features/admin/teams/service/teams.ts — liste, fiche, modification,
// suppression et opérations en lot sur les équipes (`/api/admin/teams`,
// `/api/admin/teams/[teamId]`, `/api/admin/teams/bulk`).
//
// Règles conservées des routes d'origine :
//   * la liste exclut la corbeille (`deleted_at`) sauf `?includeDeleted=1`,
//     et filtre EXACTEMENT comme l'export (utils/teams/adminTeamsFilters) ;
//   * `captain_id` NULL est un état légitime (équipe créée par un manager) ;
//   * dissoudre une équipe (soft ou hard) émet `team.dissolved` pour que le
//     bot retire rôle et salons Discord.

import type { ServiceContext } from '@/utils/admin/serviceContext';
import type { TablesUpdate } from '@/types/database.generated';
import { isValidUUID, sanitizeSearch, sanitizeUrl } from '@/utils/apiHelpers';
import { emitBotEvent } from '@/utils/botEvents';
import {
  SKILL_RATING_MAX,
  SKILL_RATING_MIN,
  isValidSkillRating,
} from '@/utils/overwatchRank';
import { parseLogoCreditInput } from '@/utils/teams/logoCredit';
import {
  fetchTournamentRegistrations,
  parseActiveFilter,
} from '@/utils/teams/adminTeamsFilters';
import { fetchAdminUserProfiles } from '@/utils/adminUserProfiles';
import type { Audited } from '../../_shared/audited';
import * as teams from '../repository/teams';
import { TEAM_UPDATABLE_FIELDS } from '../schemas';
import { fail, isTruthyFlag } from './common';

type TeamRow = NonNullable<Awaited<ReturnType<typeof teams.getTeamRow>>['row']>;

/* ------------------------------- liste --------------------------------- */

export async function listTeams(
  ctx: ServiceContext,
  query: Record<string, unknown>,
  page: { limit: number; offset: number }
): Promise<{ teams: TeamRow[]; total: number | null }> {
  const { tournamentId } = query;

  let teamIds: string[] | null = null;
  if (typeof tournamentId === 'string' && tournamentId) {
    const { registrations } = await fetchTournamentRegistrations(
      ctx.tenantId,
      tournamentId
    );
    teamIds = [...registrations.keys()];
    // Aucune équipe dans ce tournoi.
    if (teamIds.length === 0) return { teams: [], total: 0 };
  }

  const { rows, error, count } = await teams.listTeams(ctx.db, ctx.tenantId, {
    ...page,
    withCount: isTruthyFlag(query.includeTotal),
    search: sanitizeSearch(query.search as string | string[] | undefined),
    isActive: parseActiveFilter(query.isActive),
    includeDeleted: isTruthyFlag(query.includeDeleted),
    teamIds,
  });

  if (error) {
    ctx.logger.error('admin GET teams error:', error);
    throw fail(500, 'Failed to fetch teams');
  }

  return {
    teams: rows,
    total: typeof count === 'number' ? count : null,
  };
}

/* ------------------------------- fiche --------------------------------- */

/**
 * Par défaut ne renvoie QUE `{ team }`. `?withMembers=1` joint le roster
 * (seul `pages/admin/teams/my.tsx`, chemin admin, le demande). Le nom
 * affiché vient des métadonnées des utilisateurs (RPC, pas de table
 * `profiles`).
 */
export async function getTeam(
  ctx: ServiceContext,
  id: string,
  withMembers: boolean
) {
  const { row: team, error } = await teams.getTeamRow(ctx.db, ctx.tenantId, id);
  if (error || !team) {
    ctx.logger.error('admin GET team error:', error);
    throw fail(404, 'Team not found');
  }

  if (!withMembers) return { team };

  const { rows, error: membersError } = await teams.listTeamMembersBrief(
    ctx.db,
    ctx.tenantId,
    id
  );
  if (membersError) {
    ctx.logger.error('admin GET team members error:', membersError);
  }

  const profiles = await fetchAdminUserProfiles(rows.map((m) => m.user_id));
  const members = rows.map((m) => ({
    id: m.id,
    user_id: m.user_id,
    display_name:
      (m.user_id ? profiles.get(m.user_id)?.display_name : null) ||
      m.battle_tag ||
      null,
    role: m.role,
    battle_tag: m.battle_tag,
    is_captain: team.captain_id === m.user_id,
  }));

  return { team, members };
}

/* ---------------------------- modification ----------------------------- */

export async function updateTeam(
  ctx: ServiceContext,
  id: string,
  body: Record<string, unknown>
): Promise<Audited<{ team: TeamRow }>> {
  const updatePayload: Record<string, unknown> = {};
  for (const key of TEAM_UPDATABLE_FIELDS) {
    if (key in body) updatePayload[key] = body[key];
  }

  // Langue des messages de match : liste fermée (chaque valeur a sa
  // traduction réelle, cf. migration teams_preferred_locale).
  if (
    'preferred_locale' in body &&
    body.preferred_locale !== null &&
    body.preferred_locale !== 'fr' &&
    body.preferred_locale !== 'en'
  ) {
    throw fail(400, 'preferred_locale must be "fr", "en" or null');
  }

  if (Object.keys(updatePayload).length === 0) {
    throw fail(
      400,
      'No valid fields to update. Allowed: ' + TEAM_UPDATABLE_FIELDS.join(', ')
    );
  }

  if (
    'name' in body &&
    (typeof body.name !== 'string' || body.name.trim().length === 0)
  ) {
    throw fail(400, 'Team name cannot be empty');
  }

  if (
    'short_name' in body &&
    body.short_name !== null &&
    (typeof body.short_name !== 'string' || body.short_name.trim().length === 0)
  ) {
    throw fail(400, 'short_name cannot be empty');
  }

  // slug : lowercase + chiffres + tirets, 1..64 caractères.
  if ('slug' in updatePayload && updatePayload.slug != null) {
    const v = updatePayload.slug;
    if (
      typeof v !== 'string' ||
      v.length === 0 ||
      v.length > 64 ||
      !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(v)
    ) {
      throw fail(
        400,
        'slug doit contenir uniquement [a-z0-9-] (1 à 64 caractères, sans tirets en bord)'
      );
    }
  }

  // skill_rating : un « 3500 » venu d'un formulaire est coercé, pas recopié.
  if ('skill_rating' in updatePayload) {
    const raw = updatePayload.skill_rating;
    if (raw === null || (typeof raw === 'string' && raw.trim() === '')) {
      updatePayload.skill_rating = null;
    } else {
      const parsed = typeof raw === 'string' ? Number(raw.trim()) : raw;
      if (!isValidSkillRating(parsed)) {
        throw fail(
          400,
          `skill_rating doit être un entier entre ${SKILL_RATING_MIN} et ${SKILL_RATING_MAX}, ou null`
        );
      }
      updatePayload.skill_rating = parsed;
    }
  }

  // Crédit du logo : mêmes bornes que les CHECK SQL, vérifiées avant
  // l'écriture ; le patch nettoyé remplace la saisie brute.
  if (
    'logo_credit_name' in updatePayload ||
    'logo_credit_url' in updatePayload
  ) {
    const credit = parseLogoCreditInput(body);
    if (!credit.ok) throw fail(400, credit.error);
    Object.assign(updatePayload, credit.patch);
  }

  // discord_role_id : snowflake Discord ou null.
  if (
    'discord_role_id' in updatePayload &&
    updatePayload.discord_role_id != null
  ) {
    const v = updatePayload.discord_role_id;
    if (typeof v !== 'string' || !/^\d{17,20}$/.test(v.trim())) {
      throw fail(
        400,
        'discord_role_id doit être un ID Discord (17 à 20 chiffres) ou null'
      );
    }
    updatePayload.discord_role_id = v.trim();
  }

  // URLs : refuse javascript:, data:, etc.
  for (const field of [
    'logo_url',
    'banner_url',
    'website',
    'twitter',
    'discord',
  ] as const) {
    if (field in updatePayload && updatePayload[field] != null) {
      const val = updatePayload[field];
      if (typeof val === 'string' && val !== '') {
        const safe = sanitizeUrl(val);
        if (!safe) throw fail(400, `${field} must be a valid http(s) URL`);
        updatePayload[field] = safe;
      }
    }
  }

  updatePayload.updated_at = new Date().toISOString();

  const { row: before, error: fetchErr } = await teams.getTeamRow(
    ctx.db,
    ctx.tenantId,
    id
  );
  if (fetchErr || !before) throw fail(404, 'Team not found');

  // Capitanat : la cible doit être membre (non-coach) de CETTE équipe, comme
  // l'exige `reassign_captain`. Sans ce recoupement, n'importe quel compte —
  // d'un autre espace compris — devenait capitaine. NULL reste légitime, et
  // la valeur déjà en place est laissée telle quelle (formulaire renvoyé).
  const nextCaptain = updatePayload.captain_id;
  if (
    'captain_id' in updatePayload &&
    nextCaptain != null &&
    nextCaptain !== before.captain_id
  ) {
    if (typeof nextCaptain !== 'string' || !isValidUUID(nextCaptain)) {
      throw fail(400, 'captain_id doit être un identifiant valide ou null');
    }
    const { eligible, error: capErr } = await teams.isEligibleCaptain(
      ctx.db,
      ctx.tenantId,
      id,
      nextCaptain
    );
    if (capErr) {
      ctx.logger.error('admin PUT team captain lookup error:', capErr);
      throw fail(500, 'Failed to update team');
    }
    if (!eligible) {
      throw fail(
        400,
        "Ce joueur n'est pas un membre valide de cette équipe (ou est coach)."
      );
    }
  }

  const { row: team, error } = await teams.updateTeamRow(
    ctx.db,
    ctx.tenantId,
    id,
    updatePayload as TablesUpdate<'teams'>
  );
  if (error || !team) {
    ctx.logger.error('admin PUT team error:', error);
    throw fail(500, 'Failed to update team');
  }

  return {
    result: { team },
    audit: {
      entity_type: 'team',
      entity_id: id,
      tournament_id: null,
      payload: { before, after: team },
    },
  };
}

/* ----------------------------- suppression ----------------------------- */

type DeleteResult =
  | { success: true; hardDeleted: true }
  | { success: true; hardDeleted: false; team: TeamRow };

function emitDissolved(
  ctx: ServiceContext,
  id: string,
  before: TeamRow,
  hardDelete: boolean
) {
  void emitBotEvent(
    'team.dissolved',
    {
      teamId: id,
      name: before.name,
      hardDelete,
      discordRoleId: before.discord_role_id ?? null,
      discordChannelId: before.discord_channel_id ?? null,
      discordVoiceChannelId: before.discord_voice_channel_id ?? null,
    },
    ctx.tenantId
  ).catch((e) => ctx.logger.error('[botEvents] team.dissolved emit error:', e));
}

/**
 * Soft (défaut) : `is_active=false` + corbeille. Hard (`?hard=1`) : efface
 * les demandes, inscriptions de phase et membres, puis l'équipe.
 */
export async function deleteTeam(
  ctx: ServiceContext,
  id: string,
  hard: boolean
): Promise<Audited<DeleteResult>> {
  const { row: before, error: fetchErr } = await teams.getTeamRow(
    ctx.db,
    ctx.tenantId,
    id
  );
  if (fetchErr || !before) throw fail(404, 'Team not found');

  if (hard) {
    for (const table of ['demandes', 'stage_teams', 'team_members'] as const) {
      const { error } = await teams.deleteTeamDependents(
        ctx.db,
        ctx.tenantId,
        id,
        table
      );
      if (error) {
        ctx.logger.error(
          `admin hard delete team — ${table} cleanup error:`,
          error
        );
      }
    }

    const { error } = await teams.deleteTeamRow(ctx.db, ctx.tenantId, id);
    if (error) {
      ctx.logger.error('admin hard delete team error:', error);
      throw fail(500, 'Failed to hard-delete team');
    }

    emitDissolved(ctx, id, before, true);

    return {
      result: { success: true, hardDeleted: true },
      audit: {
        action: 'delete_team',
        entity_type: 'team',
        entity_id: id,
        tournament_id: null,
        payload: {
          hard_delete: true,
          cascade: { demandes: true, stage_teams: true, team_members: true },
        },
      },
    };
  }

  const nowIso = new Date().toISOString();
  const { row: team, error } = await teams.updateTeamRow(
    ctx.db,
    ctx.tenantId,
    id,
    { is_active: false, deleted_at: nowIso, updated_at: nowIso }
  );
  if (error || !team) {
    ctx.logger.error('admin soft delete team error:', error);
    throw fail(500, 'Failed to deactivate team');
  }

  emitDissolved(ctx, id, before, false);

  return {
    result: { success: true, hardDeleted: false, team },
    audit: {
      action: 'update_team',
      entity_type: 'team',
      entity_id: id,
      tournament_id: null,
      payload: { soft_delete: true, new_is_active: false },
    },
  };
}

/* -------------------------------- lots --------------------------------- */

type BulkAction = 'delete' | 'activate' | 'deactivate' | 'assign';

/**
 * `delete` / `activate` / `deactivate` / `assign` sur ≤ 200 équipes.
 *
 * `assign` vérifie le tournoi ET chaque `teamIds` dans l'espace du staff,
 * avant toute écriture : une seule équipe étrangère → 404, rien d'inscrit.
 */
export async function bulkTeams(
  ctx: ServiceContext,
  body: Record<string, unknown>
): Promise<Audited<{ success: boolean; count: number; action: string }>> {
  if (!body.action) throw fail(400, "Champ 'action' requis");
  if (!Array.isArray(body.teamIds) || body.teamIds.length === 0) {
    throw fail(400, "Champ 'teamIds' requis (tableau non vide)");
  }
  if (body.teamIds.length > 200) {
    throw fail(400, 'Maximum 200 equipes par operation');
  }

  const action = body.action as BulkAction;
  const teamIds = body.teamIds as string[];
  const tournamentId = body.tournamentId as string | undefined;
  const nowIso = new Date().toISOString();
  let count = 0;

  const run = async (patch: TablesUpdate<'teams'>) => {
    const { rows, error } = await teams.bulkUpdateTeams(
      ctx.db,
      ctx.tenantId,
      teamIds,
      patch
    );
    if (error) throw error;
    return rows.length;
  };

  try {
    switch (action) {
      case 'delete':
        count = await run({
          is_active: false,
          deleted_at: nowIso,
          updated_at: nowIso,
        });
        break;
      case 'activate':
        count = await run({
          is_active: true,
          deleted_at: null,
          updated_at: nowIso,
        });
        break;
      case 'deactivate':
        // Désactiver n'est PAS supprimer : `deleted_at` intact, sinon
        // l'équipe part en corbeille (indistinguable de 'delete').
        count = await run({ is_active: false, updated_at: nowIso });
        break;
      case 'assign': {
        if (!tournamentId) {
          throw fail(400, "Champ 'tournamentId' requis pour l'action 'assign'");
        }
        if (!(await teams.tournamentExists(ctx.db, ctx.tenantId, tournamentId)))
          throw fail(404, 'Tournoi introuvable');
        const owned = await teams.teamIdsInTenant(
          ctx.db,
          ctx.tenantId,
          teamIds
        );
        if (owned.error) throw owned.error;
        if (teamIds.some((tid) => !owned.ids.has(tid)))
          throw fail(404, 'Equipe introuvable');

        const { rows, error } =
          await teams.upsertRegistrationsIgnoringDuplicates(
            ctx.db,
            teamIds.map((tid) => ({
              tenant_id: ctx.tenantId,
              tournament_id: tournamentId,
              team_id: tid,
              status: 'registered',
            }))
          );
        if (error) throw error;
        count = rows.length;
        break;
      }
      default:
        throw fail(400, `Action inconnue: ${action}`);
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'LegacyAdminError') throw err;
    ctx.logger.error('[/api/admin/teams/bulk] error:', err);
    throw fail(500, (err as Error)?.message || 'Erreur interne');
  }

  return {
    result: { success: true, count, action },
    audit: {
      entity_type: 'team',
      tournament_id: tournamentId || null,
      payload: { action_label: `bulk_${action}`, team_ids: teamIds, count },
    },
  };
}
