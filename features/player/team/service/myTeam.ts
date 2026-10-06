// features/player/team/service/myTeam.ts — « Mon équipe » : la tranche équipe
// (lecture) et l'identité de l'équipe (écriture). Ex-/api/admin/teams/my,
// désormais GET / PATCH /api/player/team (lot P10) — même contrat.
//
// Source canonique équipe / capitanat : `loadManagedTeamSlice`
// (utils/teams/managedTeamSlice.ts), partagée avec /api/player/dashboard.
// L'écriture exige `manage_team_info` sur l'équipe DÉSIGNÉE PAR LE CORPS
// (`teamId`), résolue dans le tenant du sujet : la route ne peut pas la
// déclarer par `team: { permission }`, qui lit `?teamId=`.

import type { AdminDb } from '@/utils/admin/serviceContext';
import type { Logger } from '@/utils/logger';
import type { SubjectContext } from '@/utils/subject';
import {
  AdminError,
  adminErrorFromStatus,
  NotFoundError,
} from '@/utils/admin/errors';
import { sanitizeUrl } from '@/utils/apiHelpers';
import {
  assertTeamPermission,
  getManagedTeam,
  TEAM_MANAGEMENT_FORBIDDEN,
} from '@/utils/teams/managementAccess';
import { loadManagedTeamSlice } from '@/utils/teams/managedTeamSlice';
import {
  SKILL_RATING_MAX,
  SKILL_RATING_MIN,
  isValidSkillRating,
} from '@/utils/overwatchRank';
import {
  teamExists,
  updateTeamInfo,
  type TeamInfoPatch,
} from '../repository/myTeam';
import type { TeamInfoPatchInput } from '../schemas';
import { loadRosterLockView } from './rosterUnlock';

export type MyTeamContext = {
  db: AdminDb;
  tenantId: string;
  subject: SubjectContext;
  logger: Logger;
};

/** GET : `teamId` choisit l'équipe quand l'appelante en gère plusieurs. */
export async function getMyTeam(ctx: MyTeamContext, teamId: string | null) {
  const slice = await loadManagedTeamSlice(ctx.subject.userId, ctx.tenantId, {
    teamId,
  });
  // État du verrou de roster (lot P7) : la capitaine le voit avant d'écrire
  // au lieu de le découvrir par une 409. `null` quand on ne sait pas.
  const team = slice.team as { id?: string; name?: string } | null;
  const rosterLock =
    team?.id && typeof team.name === 'string'
      ? await loadRosterLockView(
          ctx.db,
          ctx.tenantId,
          { id: team.id, name: team.name },
          ctx.logger
        )
      : null;
  // Forme publique inchangée ; `permissions`, `managedTeams` et `rosterLock`
  // sont des ajouts.
  return {
    team: slice.team,
    members: slice.members,
    isCaptain: slice.isCaptain,
    isManager: slice.isManager,
    permissions: slice.permissions,
    managedTeams: slice.managedTeams,
    rosterLock,
  };
}

const bad = (message: string) => adminErrorFromStatus(400, message);

/** Chaîne ou `null` ; toute autre forme est refusée avec `field invalide.` */
function optionalText(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw bad(`${field} invalide.`);
  return value;
}

const has = (body: TeamInfoPatchInput, key: keyof TeamInfoPatchInput) =>
  body[key] !== undefined;

/** Valide le corps dans l'ordre historique et construit l'écriture. */
function buildPatch(body: TeamInfoPatchInput): TeamInfoPatch {
  const name = typeof body.name === 'string' ? body.name.trim() : undefined;
  if (name !== undefined && (name.length < 2 || name.length > 100)) {
    throw bad('Le nom doit faire entre 2 et 100 caractères.');
  }

  // Bornes du sigle et du pays (16 et non 12 : un sigle existant fait déjà
  // 13 caractères — une validation qui refuse des données en place est un
  // piège).
  const shortName = optionalText(body.short_name, 'short_name');
  if (shortName && shortName.trim().length > 16) {
    throw bad('Le sigle ne peut pas dépasser 16 caractères.');
  }
  const country = optionalText(body.country, 'country');
  if (country && country.trim().length > 56) {
    throw bad('Le pays ne peut pas dépasser 56 caractères.');
  }
  const description = optionalText(body.description, 'description');
  if (description && description.length > 2000) {
    throw bad('La description ne peut pas dépasser 2000 caractères.');
  }

  // SR d'ensemble : mêmes bornes et même contrat que le SR par joueuse.
  let skillRating: number | null = null;
  if (has(body, 'skill_rating')) {
    const raw = body.skill_rating;
    if (raw === null || (typeof raw === 'string' && raw.trim() === '')) {
      skillRating = null;
    } else {
      const parsed = typeof raw === 'string' ? Number(raw.trim()) : raw;
      if (!isValidSkillRating(parsed)) {
        throw bad(
          `Le SR d'équipe doit être un entier entre ${SKILL_RATING_MIN} et ${SKILL_RATING_MAX}.`
        );
      }
      skillRating = parsed as number;
    }
  }

  const urls: Partial<Record<'logo_url' | 'website' | 'discord', string>> = {};
  for (const field of ['logo_url', 'website', 'discord'] as const) {
    const raw = optionalText(body[field], field);
    if (!raw) continue;
    const safe = sanitizeUrl(raw);
    if (!safe) throw bad(`${field} doit être une URL http(s) valide.`);
    urls[field] = safe;
  }

  const patch: TeamInfoPatch = { updated_at: new Date().toISOString() };
  if (name !== undefined) patch.name = name;
  if (has(body, 'short_name')) patch.short_name = shortName?.trim() || null;
  if (has(body, 'logo_url')) patch.logo_url = urls.logo_url ?? null;
  if (has(body, 'country')) patch.country = country || null;
  if (has(body, 'description')) patch.description = description || null;
  if (has(body, 'discord')) patch.discord = urls.discord ?? null;
  if (has(body, 'website')) patch.website = urls.website ?? null;
  if (has(body, 'skill_rating')) patch.skill_rating = skillRating;
  return patch;
}

/** PATCH : nom, sigle, logo, pays, description, liens, SR d'ensemble. */
export async function patchMyTeam(
  ctx: MyTeamContext,
  body: TeamInfoPatchInput
) {
  // Accès résolu sur `body.teamId` (un manager peut en gérer plusieurs),
  // dans le tenant du sujet. Permission fine : `manage_team_info` — un coach
  // (scrims + feuille de match) ne renomme pas l'équipe.
  const access = await getManagedTeam(
    ctx.subject.userId,
    ctx.tenantId,
    body.teamId
  );
  if (!access || access.teamId !== body.teamId) {
    throw new AdminError(403, 'forbidden', TEAM_MANAGEMENT_FORBIDDEN);
  }
  const denied = assertTeamPermission(access, 'manage_team_info');
  if (denied) throw new AdminError(403, 'forbidden', denied.error);

  const { exists, error: readErr } = await teamExists(
    ctx.db,
    ctx.tenantId,
    body.teamId
  );
  if (readErr || !exists) throw new NotFoundError('Team not found.');

  const patch = buildPatch(body);
  const { team, error } = await updateTeamInfo(
    ctx.db,
    ctx.tenantId,
    body.teamId,
    patch
  );
  if (error) {
    ctx.logger.error('[teams/my] update error:', error);
    throw new AdminError(500, 'internal', 'Failed to update team.');
  }

  return {
    team,
    members: [] as never[],
    isCaptain: access.isCaptain,
    isManager: access.isManager,
  };
}
