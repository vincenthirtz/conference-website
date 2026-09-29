// features/player/team/service/rights.ts — délégation de droits DANS
// l'équipe (lot J3), migrée en P10 depuis pages/api/teams/member-permissions.
//
// Trois règles, toutes ici et nulle part ailleurs :
//   1. Déléguer est un geste de ROSTER → `manage_roster` (exigé par la route,
//      `team: { permission }` : l'accès arrive résolu dans `ctx.team`).
//   2. On ne délègue pas ce qu'on n'a pas soi-même — sinon un rôle partiel
//      s'auto-élargirait.
//   3. La cible est membre de l'équipe — pas de droit sans appartenance.
//
// La surcharge est ADDITIVE : révoquer une permission que le RÔLE donne ne la
// retire pas, et l'écran le dit (source « rôle » non cochable).

import type { AdminDb } from '@/utils/admin/serviceContext';
import type { Logger } from '@/utils/logger';
import type { SubjectContext } from '@/utils/subject';
import type { TeamManagementAccess } from '@/utils/teams/managementAccess';
import {
  AdminError,
  LegacyAdminError,
  NotFoundError,
} from '@/utils/admin/errors';
import {
  isTeamPermission,
  loadTeamRolesFromSupabase,
  roleHasPermission,
  TEAM_PERMISSION_VALUES,
  type TeamPermission,
} from '@/utils/teamRoles';
import {
  hasActiveGrant,
  insertGrant,
  isTeamMember,
  listGrants,
  listMemberRoles,
  readCaptainId,
  revokeGrant,
} from '../repository/rights';
import type {
  MemberPermissionInput,
  TeamMemberPermissionState,
  TeamMemberRightChange,
  TeamMemberRightsResponse,
  TeamPermissionGrant,
} from '../schemas';

export type TeamRightsContext = {
  db: AdminDb;
  tenantId: string;
  subject: SubjectContext;
  logger: Logger;
  team: TeamManagementAccess;
};

/** Délégations (actives et révoquées) + droits par membre, par source. */
export async function getMemberRights(
  ctx: TeamRightsContext
): Promise<TeamMemberRightsResponse> {
  const { db, tenantId } = ctx;
  const teamId = ctx.team.teamId;

  const { grants: rows, error } = await listGrants(db, tenantId, teamId);
  if (error) {
    ctx.logger.error('[team/member-permissions] read error', error);
    throw new AdminError(500, 'internal', 'Lecture impossible.');
  }
  const grants: TeamPermissionGrant[] = rows.flatMap((r) =>
    isTeamPermission(r.permission)
      ? [
          {
            userId: r.user_id,
            permission: r.permission,
            grantedBy: r.granted_by ?? null,
            createdAt: r.created_at,
            revokedAt: r.revoked_at ?? null,
          },
        ]
      : []
  );

  // Config des rôles DU TENANT de l'équipe : elle n'a rien à faire côté client.
  const [rolesConfig, roster, captainId] = await Promise.all([
    loadTeamRolesFromSupabase(db, tenantId),
    listMemberRoles(db, tenantId, teamId),
    readCaptainId(db, tenantId, teamId),
  ]);
  if (roster.error) {
    ctx.logger.error('[team/member-permissions] members error', roster.error);
  }

  const activeByUser = new Map<string, TeamPermission[]>();
  for (const g of grants) {
    if (g.revokedAt) continue;
    activeByUser.set(g.userId, [
      ...(activeByUser.get(g.userId) ?? []),
      g.permission,
    ]);
  }

  const members: TeamMemberPermissionState[] = roster.members.flatMap((m) => {
    if (!m.user_id) return [];
    // La capitaine a tout par définition (capitanat voulu, S4) : l'écran ne
    // lui propose pas de « déléguer » ce qu'elle possède déjà.
    const fromRole =
      m.user_id === captainId
        ? [...TEAM_PERMISSION_VALUES]
        : TEAM_PERMISSION_VALUES.filter((p) =>
            roleHasPermission(rolesConfig, m.role, p)
          );
    const granted = activeByUser.get(m.user_id) ?? [];
    const all = new Set<TeamPermission>([...fromRole, ...granted]);
    return [
      {
        userId: m.user_id,
        role: m.role ?? null,
        fromRole,
        granted: TEAM_PERMISSION_VALUES.filter((p) => granted.includes(p)),
        effective: TEAM_PERMISSION_VALUES.filter((p) => all.has(p)),
      },
    ];
  });

  return {
    teamId,
    grants,
    members,
    delegatable: ctx.team.permissions,
  };
}

const REQUIRED = 'userId et permission requis.';

/** Accorde (`grant`) ou révoque une délégation. */
export async function setMemberRight(
  ctx: TeamRightsContext,
  body: MemberPermissionInput,
  grant: boolean
): Promise<TeamMemberRightChange> {
  const { db, tenantId } = ctx;
  const teamId = ctx.team.teamId;
  const { userId: targetId, permission } = body;

  if (!isTeamPermission(permission)) {
    throw new LegacyAdminError(400, REQUIRED, {
      code: 'validation',
      extra: { fields: { permission: 'Permission inconnue.' } },
    });
  }
  // Règle 2 — on ne délègue que ce qu'on a.
  if (!ctx.team.permissions.includes(permission)) {
    throw new AdminError(
      403,
      'forbidden',
      "Tu ne peux pas déléguer un droit que tu n'as pas toi-même."
    );
  }
  // Règle 3 — la cible appartient à l'équipe.
  const { member, error } = await isTeamMember(db, tenantId, teamId, targetId);
  if (error) {
    ctx.logger.error('[team/member-permissions] membership error', error);
    throw new AdminError(500, 'internal', 'Vérification impossible.');
  }
  if (!member) {
    throw new NotFoundError("Cette personne n'est pas dans ton équipe.");
  }

  const actor = ctx.subject.userId;
  if (grant) {
    // Ré-octroi d'une délégation active : no-op idempotent.
    if (!(await hasActiveGrant(db, tenantId, teamId, targetId, permission))) {
      const { error: insertErr } = await insertGrant(db, {
        tenant_id: tenantId,
        team_id: teamId,
        user_id: targetId,
        permission,
        granted_by: actor,
      });
      if (insertErr) {
        ctx.logger.error('[team/member-permissions] grant error', insertErr);
        throw new AdminError(500, 'internal', "L'octroi a échoué.");
      }
    }
    return { granted: true, permission, userId: targetId };
  }

  const { error: revokeErr } = await revokeGrant(
    db,
    tenantId,
    teamId,
    targetId,
    permission,
    actor
  );
  if (revokeErr) {
    ctx.logger.error('[team/member-permissions] revoke error', revokeErr);
    throw new AdminError(500, 'internal', 'La révocation a échoué.');
  }
  return { granted: false, permission, userId: targetId };
}
