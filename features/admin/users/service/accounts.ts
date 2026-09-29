// features/admin/users/service/accounts.ts — gestion des comptes par le staff :
// création (POST /api/admin/users), liste / modification / suspension /
// suppression (GET · PATCH · DELETE /api/admin/users/manage).
//
// RÈGLES DE POUVOIR (inchangées, communes à toutes les écritures) :
//   * un compte owner/admin (rôle de compte OU fiche staff) n'est touché que
//     par un owner — réinitialiser son mot de passe ou le renommer compris ;
//     chacun reste libre d'agir sur SON compte (renommage, identifiants) ;
//   * anti-escalade : un non-owner n'accorde jamais un rôle staff ≥ au sien,
//     ni à la création ni à la promotion ;
//   * garde « dernier owner » : ni rétrogradé, ni suspendu, ni supprimé ;
//   * on ne change pas son propre rôle, on ne se suspend ni ne se supprime.
// Un rôle staff n'est effectif QUE par la table `staff` (les gardes ne lisent
// pas `user_metadata`) : elle est synchronisée à chaque changement.
//
// Ce projet n'a PAS de table `profiles` : le profil vit dans
// `auth.users.raw_user_meta_data` (`user_metadata` côté supabase-js).

import crypto from 'node:crypto';
import type { ServiceContext } from '@/utils/admin/serviceContext';
import {
  AdminError,
  LegacyAdminError,
  adminErrorFromStatus,
} from '@/utils/admin/errors';
import {
  invalidateStaffCache,
  STAFF_ROLE_RANK,
  STAFF_ROLES,
  type StaffRole,
} from '@/utils/staff';
import { sendAccountDeletedEmail, sendWelcomeEmail } from '@/utils/email';
import { emitRoleSyncEvent } from '@/utils/botRoleSync';
import { computeBattleTagMismatch } from '@/utils/auth/battleTagMismatch';
import { BATTLE_TAG_REGEX } from '@/utils/teams/roleKind';
import { oneRelation } from '@/utils/supabase/relation';
import type { Audited } from '../../_shared/audited';
import * as repo from '../repository';

type AccountMetadata = { role?: string; display_name?: string };

/** Le staff qui agit : ce que les gardes de pouvoir lisent. */
export type AccountActor = {
  staffId: string;
  userId: string;
  role: string | null;
};

const fail = (status: number, message: string) =>
  adminErrorFromStatus(status, message);

export function generatePassword(length = 16): string {
  const alphabet =
    'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz0123456789!@$%^*';
  // Rejection sampling : pas de biais de modulo.
  const maxValid = 256 - (256 % alphabet.length);
  const result: string[] = [];
  while (result.length < length) {
    const bytes = crypto.randomBytes(length - result.length);
    for (const byte of bytes) {
      if (byte < maxValid && result.length < length) {
        result.push(alphabet[byte % alphabet.length]);
      }
    }
  }
  return result.join('');
}

/** Un non-owner ne peut pas accorder un rôle staff ≥ au sien. */
function grantsAtOrAbove(requesterRole: string | null, role: string): boolean {
  if (!(STAFF_ROLES as readonly string[]).includes(role)) return false;
  if (requesterRole === 'owner') return false;
  const newRank = STAFF_ROLE_RANK[role as StaffRole];
  const requesterRank = requesterRole
    ? STAFF_ROLE_RANK[requesterRole as StaffRole]
    : -1;
  return newRank >= requesterRank;
}

/* ---------------------------------------------------------------------------
 * POST /api/admin/users — création d'un compte
 * ------------------------------------------------------------------------ */

const ASSIGNABLE_ROLES = [
  'member',
  'player',
  'caster',
  'admin',
  'owner',
] as const;
/** Plancher Supabase Auth : en dessous, 400 explicite plutôt qu'un aléatoire. */
const MIN_PASSWORD_LENGTH = 6;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type CreatedUser = {
  userId: string;
  email: string;
  passwordSentByEmail: boolean;
  /** Rôle staff réellement accordé (ligne `staff` créée), sinon null. */
  staffRoleGranted: StaffRole | null;
};

/** Supabase Auth ne typant pas ses codes, on reconnaît le doublon au message. */
function isDuplicateEmailError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { status?: number; code?: string; message?: string };
  if (e.code === 'email_exists') return true;
  if (e.status === 422 || e.status === 409) return true;
  return /already (been )?registered|already exists/i.test(e.message ?? '');
}

export async function createUser(
  ctx: ServiceContext,
  actor: AccountActor,
  body: {
    email?: unknown;
    password?: unknown;
    display_name?: unknown;
    role?: unknown;
  }
): Promise<Audited<CreatedUser>> {
  const { email, password, display_name, role } = body;

  if (typeof email !== 'string' || email.trim().length === 0) {
    throw fail(400, 'Email is required');
  }
  const safeEmail = email.trim();
  if (!EMAIL_RE.test(safeEmail)) {
    throw new LegacyAdminError(400, 'Invalid email address', {
      code: 'invalid_email',
    });
  }

  const providedPassword =
    typeof password === 'string' && password.trim().length > 0
      ? password.trim()
      : null;
  if (providedPassword && providedPassword.length < MIN_PASSWORD_LENGTH) {
    throw new LegacyAdminError(
      400,
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      { code: 'weak_password' }
    );
  }
  const plainPassword = providedPassword ?? generatePassword(16);

  const requestedRole =
    typeof role === 'string' && role.trim()
      ? role.trim().toLowerCase()
      : 'player';
  if (!(ASSIGNABLE_ROLES as readonly string[]).includes(requestedRole)) {
    throw new LegacyAdminError(400, 'Invalid role', { code: 'invalid_role' });
  }

  // Anti-escalade, identique au PATCH rôle.
  const isStaffRole = (STAFF_ROLES as readonly string[]).includes(
    requestedRole
  );
  if (grantsAtOrAbove(actor.role, requestedRole)) {
    throw new LegacyAdminError(
      403,
      'You cannot grant a role equal to or above your own.',
      { code: 'role_forbidden' }
    );
  }

  const safeDisplayName =
    typeof display_name === 'string' && display_name.trim()
      ? display_name.trim()
      : null;

  const { data, error } = await ctx.db.auth.admin.createUser({
    email: safeEmail,
    password: plainPassword,
    email_confirm: true,
    user_metadata: { display_name: safeDisplayName, role: requestedRole },
  });

  if (error || !data?.user?.id) {
    ctx.logger.error('[/api/admin/users] createUser error:', error);
    if (isDuplicateEmailError(error)) {
      throw new LegacyAdminError(
        409,
        'An account already exists with this email address',
        { code: 'email_exists' }
      );
    }
    throw fail(500, 'Failed to create user');
  }

  const userId = data.user.id;

  // Synchronisation `staff` : un rôle staff n'est effectif QUE via cette table.
  let staffRoleGranted: StaffRole | null = null;
  if (isStaffRole) {
    const { error: staffErr } = await repo.insertStaff(ctx.db, {
      auth_user_id: userId,
      role: requestedRole,
      display_name: safeDisplayName,
      email: safeEmail,
    });
    if (staffErr) {
      ctx.logger.error('[/api/admin/users] staff row insert error:', staffErr);
    } else {
      staffRoleGranted = requestedRole as StaffRole;
    }
  }
  // Pas d'emitRoleSyncEvent : le compte vient de naître, pas de lien Discord.

  // `sendWelcomeEmail` NE LÈVE PAS en cas d'échec : on lit son résultat, sinon
  // on annoncerait « mot de passe envoyé » alors que rien n'est parti.
  let passwordSentByEmail = false;
  try {
    const emailResult = await sendWelcomeEmail(safeEmail, plainPassword);
    passwordSentByEmail = emailResult?.success === true;
    if (!passwordSentByEmail) {
      ctx.logger.error(
        '[/api/admin/users] welcome email not sent:',
        emailResult?.error
      );
    }
  } catch (emailErr) {
    ctx.logger.error('[/api/admin/users] welcome email error:', emailErr);
  }

  return {
    result: { userId, email: safeEmail, passwordSentByEmail, staffRoleGranted },
    audit: {
      entity_type: 'user',
      entity_id: userId,
      payload: {
        targetEmail: safeEmail,
        metadataRole: requestedRole,
        staffRoleGranted,
        passwordProvided: Boolean(providedPassword),
        passwordSentByEmail,
      },
    },
  };
}

/* ---------------------------------------------------------------------------
 * GET /api/admin/users/manage — liste paginée (RPC admin_list_users)
 * ------------------------------------------------------------------------ */

type TeamMembership = {
  team_id: string;
  team_name: string;
  role: string;
  battle_tag: string | null;
  battle_tag_verified_at: string | null;
  /** Compte Blizzard vérifié ≠ tag du roster (anti-smurf). */
  battle_tag_mismatch: boolean;
};

export type UserLite = {
  id: string;
  email: string | null;
  role: string | null;
  display_name: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  banned_until?: string | null;
  discord_username?: string | null;
  discord_user_id?: string | null;
  team_memberships?: TeamMembership[];
};

const SORT_FIELDS = new Set([
  'created_at',
  'display_name',
  'email',
  'role',
  'last_sign_in_at',
]);
const FILTER_FLAGS = new Set([
  'staff',
  'community',
  'no_team',
  'no_discord',
  'never_signed_in',
  'inactive_6m',
  'suspended',
  'battletag_mismatch',
]);

function normParam(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t : null;
}

export async function listUsers(
  ctx: ServiceContext,
  query: Record<string, unknown>
): Promise<{ items: UserLite[]; total: number }> {
  const {
    search,
    role: roleFilter,
    limit = '20',
    offset = '0',
    sort,
    dir,
    filters: rawFilters,
  } = query;
  const lim = Math.max(1, Math.min(200, Number(limit) || 20));
  const off = Math.max(0, Number(offset) || 0);
  const sortField =
    typeof sort === 'string' && SORT_FIELDS.has(sort) ? sort : 'created_at';
  const sortDir = dir === 'asc' ? 'asc' : 'desc';
  const filters =
    typeof rawFilters === 'string'
      ? Array.from(
          new Set(
            rawFilters
              .split(',')
              .map((f) => f.trim().toLowerCase())
              .filter((f) => FILTER_FLAGS.has(f))
          )
        )
      : [];

  const { rows, error } = await repo.listUsersPage(ctx.db, {
    p_query: normParam(search),
    p_role: normParam(roleFilter),
    p_limit: lim,
    p_offset: off,
    p_sort: sortField,
    p_dir: sortDir,
    ...(filters.length ? { p_filters: filters } : {}),
  });

  if (error) {
    ctx.logger.error('[admin/users/manage] list error:', error);
    if (filters.length) {
      // Cas le plus probable : la RPC n'a pas encore le paramètre p_filters.
      throw new AdminError(
        503,
        'service_unavailable',
        'Filtres avancés indisponibles : la migration add_admin_list_users_filters.sql doit être appliquée.'
      );
    }
    throw fail(500, 'Failed to load users.');
  }

  // Le générateur type les colonnes d'un `RETURNS TABLE` comme non nulles.
  type RpcRow = {
    id: string;
    email: string | null;
    role: string | null;
    display_name: string | null;
    created_at: string | null;
    last_sign_in_at: string | null;
    banned_until?: string | null;
    total_count: number | string | null;
  };
  const rpcRows = rows as RpcRow[];
  const total = Number(rpcRows[0]?.total_count ?? 0);

  const items: UserLite[] = rpcRows.map((row) => ({
    id: row.id,
    email: row.email ?? null,
    role: row.role?.toLowerCase() ?? null,
    display_name: row.display_name ?? null,
    created_at: row.created_at ?? null,
    last_sign_in_at: row.last_sign_in_at ?? null,
    banned_until: row.banned_until ?? null,
  }));

  const pageUserIds = items.map((u) => u.id);
  const teamMembershipsMap = new Map<string, TeamMembership[]>();
  const discordByUser = new Map<
    string,
    { discord_user_id: string; discord_username: string | null }
  >();

  if (pageUserIds.length) {
    // Les trois enrichissements (Discord / Battle.net / équipes) sont
    // indépendants : une seule latence au lieu de trois. Best-effort.
    const { discordLinks, bnetLinks, teamMembers } = await repo.pageEnrichment(
      ctx.db,
      pageUserIds
    );

    for (const row of discordLinks) {
      if (row?.auth_user_id && row?.discord_user_id) {
        discordByUser.set(row.auth_user_id, {
          discord_user_id: String(row.discord_user_id),
          discord_username: row.discord_username ?? null,
        });
      }
    }

    const linkedTagByUser = new Map<string, string>();
    for (const row of bnetLinks) {
      if (row?.auth_user_id && row?.battle_tag) {
        linkedTagByUser.set(row.auth_user_id, String(row.battle_tag));
      }
    }

    for (const row of teamMembers ?? []) {
      // PostgREST rend l'embed en objet OU en tableau (utils/supabase/relation).
      const team = oneRelation(row.team);
      if (row?.user_id && team) {
        const existing = teamMembershipsMap.get(row.user_id) || [];
        existing.push({
          team_id: team.id,
          team_name: team.name,
          role: row.role,
          battle_tag: row.battle_tag || null,
          battle_tag_verified_at: row.battle_tag_verified_at || null,
          battle_tag_mismatch: computeBattleTagMismatch({
            battleTag: row.battle_tag || null,
            verifiedAt: row.battle_tag_verified_at || null,
            verifiedBattleNetId: row.verified_battle_net_id || null,
            linkedTag: linkedTagByUser.get(row.user_id) ?? null,
          }),
        });
        teamMembershipsMap.set(row.user_id, existing);
      }
    }
  }

  return {
    items: items.map((u) => ({
      ...u,
      discord_user_id: discordByUser.get(u.id)?.discord_user_id ?? null,
      discord_username: discordByUser.get(u.id)?.discord_username ?? null,
      team_memberships: teamMembershipsMap.get(u.id) || [],
    })),
    total,
  };
}

/* ---------------------------------------------------------------------------
 * Cible des écritures (garde « owner/admin protégé »)
 * ------------------------------------------------------------------------ */

type TargetAccount = {
  user: NonNullable<
    Awaited<ReturnType<typeof repo.getAuthUser>>['data']['user']
  >;
  metadataRole: string | null;
  staffRole: string | null;
  isProtected: boolean;
};

async function loadTarget(
  ctx: ServiceContext,
  userId: string
): Promise<TargetAccount | null> {
  const { data: target, error } = await repo.getAuthUser(ctx.db, userId);
  if (error || !target?.user) return null;
  const metadataRole =
    (target.user.user_metadata as AccountMetadata)?.role ?? null;
  const staffRole = (await repo.findStaffRole(ctx.db, userId))?.role ?? null;
  return {
    user: target.user,
    metadataRole,
    staffRole,
    isProtected:
      metadataRole === 'owner' ||
      metadataRole === 'admin' ||
      staffRole === 'owner' ||
      staffRole === 'admin',
  };
}

async function assertNotLastOwner(ctx: ServiceContext, verb: string) {
  const { count, error } = await repo.countOwners(ctx.db);
  if (error) {
    ctx.logger.error('[admin/users/manage] owner count error:', error);
    throw fail(500, 'Failed to verify owner count.');
  }
  if (count <= 1) {
    throw fail(
      409,
      `Cannot ${verb} the last owner. Promote another user to owner first.`
    );
  }
}

function toUserLite(u: TargetAccount['user']): UserLite {
  const meta = u.user_metadata as AccountMetadata;
  return {
    id: u.id,
    email: u.email ?? null,
    role: meta?.role ?? null,
    display_name: meta?.display_name ?? null,
    created_at: u.created_at ?? null,
    last_sign_in_at:
      (u as { last_sign_in_at?: string | null }).last_sign_in_at ?? null,
  };
}

/* ---------------------------------------------------------------------------
 * PATCH /api/admin/users/manage — aiguillage historique, dans l'ordre :
 * resend_credentials → suspend/unsuspend → battle_tag → display_name → rôle.
 * ------------------------------------------------------------------------ */

export type ManagePatchBody = {
  userId?: unknown;
  action?: unknown;
  role?: unknown;
  teamId?: unknown;
  battleTag?: unknown;
  display_name?: unknown;
  duration?: unknown;
};

export async function patchUser(
  ctx: ServiceContext,
  actor: AccountActor,
  body: ManagePatchBody
): Promise<Audited<Record<string, unknown>>> {
  const { userId, role: rawRole, teamId, battleTag } = body;
  const role = typeof rawRole === 'string' ? rawRole.toLowerCase() : rawRole;
  // Les branches historiques ne vérifiaient que la présence de `userId`.
  const uid = userId as string;

  if (userId && body.action === 'resend_credentials') {
    return resendCredentials(ctx, actor, uid);
  }
  if (userId && (body.action === 'suspend' || body.action === 'unsuspend')) {
    return setSuspension(
      ctx,
      actor,
      uid,
      body.action === 'suspend',
      body.duration
    );
  }
  if (userId && teamId && typeof battleTag === 'string') {
    return updateRosterBattleTag(ctx, uid, String(teamId), battleTag);
  }
  if (userId && typeof body.display_name === 'string' && role === undefined) {
    return renameUser(ctx, actor, uid, body.display_name);
  }
  if (!userId || typeof role !== 'string') {
    throw fail(400, 'userId and role required.');
  }
  return changeRole(ctx, actor, uid, role);
}

async function resendCredentials(
  ctx: ServiceContext,
  actor: AccountActor,
  userId: string
): Promise<Audited<Record<string, unknown>>> {
  const target = await loadTarget(ctx, userId);
  if (!target) throw fail(404, 'User not found.');

  // Réinitialiser le mot de passe d'un owner/admin l'éjecte de son compte :
  // seul un owner le peut — chacun reste libre de relancer ses propres accès.
  if (target.isProtected && actor.role !== 'owner' && userId !== actor.userId) {
    throw fail(
      403,
      'Only an owner can reset the credentials of an owner or admin account.'
    );
  }

  const newPassword = generatePassword(16);
  const { error: updateErr } = await ctx.db.auth.admin.updateUserById(userId, {
    password: newPassword,
  });
  if (updateErr) {
    ctx.logger.error('[admin/users/manage] reset password error:', updateErr);
    throw fail(500, 'Failed to reset password.');
  }

  const email = target.user.email;
  const audit = {
    action: 'resend_credentials' as const,
    entity_type: 'user',
    entity_id: userId,
    payload: {
      targetEmail: email ?? null,
      targetMetadataRole: target.metadataRole,
      targetStaffRole: target.staffRole,
    },
  };

  if (email) {
    const emailResult = await sendWelcomeEmail(email, newPassword);
    if (!emailResult.success) {
      ctx.logger.error('[admin/users/manage] email failed:', emailResult.error);
      return {
        result: {
          success: true,
          warning: `Mot de passe réinitialisé mais l'email n'a pas pu être envoyé : ${emailResult.error}`,
        },
        audit,
      };
    }
  }
  return { result: { success: true }, audit };
}

/** Durées proposées par l'UI ; 'permanent' = 100 ans (convention GoTrue). */
const DURATIONS: Record<string, string> = {
  '24h': '24h',
  '7d': '168h',
  '30d': '720h',
  permanent: '876000h',
};

async function setSuspension(
  ctx: ServiceContext,
  actor: AccountActor,
  userId: string,
  suspending: boolean,
  rawDuration: unknown
): Promise<Audited<Record<string, unknown>>> {
  // Se suspendre soi-même = se déconnecter du back-office en pleine action.
  if (userId === actor.userId) {
    throw fail(403, 'You cannot suspend your own account.');
  }
  const target = await loadTarget(ctx, userId);
  if (!target) throw fail(404, 'User not found.');
  if (target.isProtected && actor.role !== 'owner') {
    throw fail(403, 'Only an owner can suspend an owner or admin account.');
  }
  if (suspending && target.staffRole === 'owner') {
    await assertNotLastOwner(ctx, 'suspend');
  }

  const durationKey = typeof rawDuration === 'string' ? rawDuration : '24h';
  if (suspending && !DURATIONS[durationKey]) {
    throw fail(400, 'Invalid suspension duration.');
  }

  const { data, error } = await ctx.db.auth.admin.updateUserById(userId, {
    ban_duration: suspending ? DURATIONS[durationKey] : 'none',
  } as { ban_duration: string });
  if (error) {
    ctx.logger.error('[admin/users/manage] suspend error:', error);
    throw fail(500, 'Failed to update suspension state.');
  }

  const bannedUntil =
    (data?.user as { banned_until?: string | null } | undefined)
      ?.banned_until ?? null;

  return {
    result: {
      success: true,
      banned_until: suspending ? (bannedUntil ?? 'pending') : null,
    },
    audit: {
      action: suspending ? 'suspend_user' : 'unsuspend_user',
      entity_type: 'user',
      entity_id: userId,
      payload: {
        targetEmail: target.user.email ?? null,
        duration: suspending ? durationKey : null,
        bannedUntil,
      },
    },
  };
}

async function updateRosterBattleTag(
  ctx: ServiceContext,
  userId: string,
  teamId: string,
  battleTag: string
): Promise<Audited<Record<string, unknown>>> {
  const trimmedTag = battleTag.trim();
  if (trimmedTag && !BATTLE_TAG_REGEX.test(trimmedTag)) {
    throw fail(400, 'Invalid BattleTag (format Name#0000)');
  }

  // La ligne DOIT exister : sans ce SELECT, un teamId erroné répondait succès.
  const { row: membership, error: memberErr } = await repo.findMembershipForTag(
    ctx.db,
    userId,
    teamId
  );
  if (memberErr) {
    ctx.logger.error(
      '[admin/users/manage] membership lookup error:',
      memberErr
    );
    throw fail(500, 'Failed to load membership.');
  }
  if (!membership) throw fail(404, 'Team membership not found.');

  // Défense en profondeur : pas d'écriture sur le roster d'un autre tenant.
  // Les lignes historiques sans tenant_id restent modifiables (fail-open).
  if (membership.tenant_id && membership.tenant_id !== ctx.tenantId) {
    throw fail(403, 'This membership belongs to another tenant.');
  }

  const previousTag = membership.battle_tag || null;
  const nextTag = trimmedTag || null;
  const tagChanged =
    (previousTag ?? '').toLowerCase() !== (nextTag ?? '').toLowerCase();

  // Une édition manuelle INVALIDE la vérification Battle.net ; le trigger
  // `sync_team_member_battletag_verification` peut la reposer — on RELIT.
  const { error: updateErr } = await repo.updateMembershipById(
    ctx.db,
    membership.id,
    tagChanged
      ? {
          battle_tag: nextTag,
          battle_tag_verified_at: null,
          verified_battle_net_id: null,
        }
      : { battle_tag: nextTag }
  );
  if (updateErr) {
    ctx.logger.error(
      '[admin/users/manage] battle_tag update error:',
      updateErr
    );
    throw fail(500, 'Failed to update BattleTag.');
  }

  const linkedTag = await repo.findLinkedBattleTag(ctx.db, userId);
  const refreshed = await repo.readMembershipVerification(
    ctx.db,
    membership.id
  );
  const verifiedAt =
    refreshed?.battle_tag_verified_at ??
    (tagChanged ? null : membership.battle_tag_verified_at || null);
  const verifiedBattleNetId =
    refreshed?.verified_battle_net_id ??
    (tagChanged ? null : membership.verified_battle_net_id || null);

  return {
    result: {
      success: true,
      membership: {
        team_id: teamId,
        battle_tag: nextTag,
        battle_tag_verified_at: verifiedAt,
        battle_tag_mismatch: computeBattleTagMismatch({
          battleTag: nextTag,
          verifiedAt,
          verifiedBattleNetId,
          linkedTag,
        }),
      },
    },
    // Même slug que /api/teams/update-member ; rien si le tag n'a pas bougé.
    audit: tagChanged
      ? {
          action: 'update_player_battle_tag',
          entity_type: 'team_member',
          entity_id: membership.id,
          payload: {
            user_id: userId,
            team_id: teamId,
            previous: previousTag,
            next: nextTag,
            verification_reset: true,
          },
        }
      : { skip: true },
  };
}

async function renameUser(
  ctx: ServiceContext,
  actor: AccountActor,
  userId: string,
  displayName: string
): Promise<Audited<Record<string, unknown>>> {
  const target = await loadTarget(ctx, userId);
  if (!target) throw fail(404, 'User not found.');
  if (target.isProtected && actor.role !== 'owner' && userId !== actor.userId) {
    throw fail(403, 'Only an owner can modify an owner or admin account.');
  }

  const existingMeta = (target.user.user_metadata as AccountMetadata) || {};
  const previousDisplayName = existingMeta.display_name ?? null;
  const nextDisplayName = displayName.trim() || null;

  const { data, error } = await ctx.db.auth.admin.updateUserById(userId, {
    user_metadata: { ...existingMeta, display_name: nextDisplayName },
  });
  if (error || !data?.user) {
    ctx.logger.error('[admin/users/manage] display_name update error:', error);
    throw fail(500, 'Failed to update display name.');
  }

  // Synchronise le nom de la fiche staff, s'il y en a une.
  if ((await repo.findStaffRole(ctx.db, userId))?.id) {
    await repo.updateStaffByUser(ctx.db, userId, {
      display_name: nextDisplayName,
    });
    invalidateStaffCache(userId);
  }

  return {
    result: { success: true, user: toUserLite(data.user) },
    audit: {
      action: 'update_member_profile',
      entity_type: 'user',
      entity_id: userId,
      payload: {
        field: 'display_name',
        previous: previousDisplayName,
        next: nextDisplayName,
      },
    },
  };
}

async function changeRole(
  ctx: ServiceContext,
  actor: AccountActor,
  userId: string,
  role: string
): Promise<Audited<Record<string, unknown>>> {
  // Un admin ne se rétrograde pas lui-même en plein milieu d'une action.
  if (userId === actor.userId) {
    throw fail(403, 'You cannot change your own role.');
  }

  const target = await loadTarget(ctx, userId);
  if (!target) {
    ctx.logger.error('[admin/users/manage] get target error:', userId);
    throw fail(404, 'Target user not found or inaccessible.');
  }

  if (target.isProtected && actor.role !== 'owner') {
    throw fail(
      403,
      'Only an owner can modify an owner or admin account. Action denied.'
    );
  }
  // Un rôle non-staff (player, member, '') passe librement : révocation.
  if (grantsAtOrAbove(actor.role, role)) {
    throw fail(
      403,
      'You cannot grant a role equal to or above your own. Action denied.'
    );
  }
  if (target.staffRole === 'owner' && role !== 'owner') {
    await assertNotLastOwner(ctx, 'demote');
  }

  const { data, error } = await ctx.db.auth.admin.updateUserById(userId, {
    user_metadata: { role },
  });
  if (error || !data?.user) {
    ctx.logger.error('[admin/users/manage] update error:', error);
    throw fail(500, 'Failed to update user.');
  }

  // Synchronise la table staff selon le rôle.
  const isStaffRole = (STAFF_ROLES as readonly string[]).includes(role);
  const existingStaff = await repo.findStaffRole(ctx.db, userId);
  const previousStaffRole = existingStaff?.role ?? null;
  let newStaffRole: string | null = null;

  if (isStaffRole) {
    newStaffRole = role;
    // Une fiche soft-deleted est réactivée.
    if (existingStaff?.id) {
      await repo.updateStaffByUser(ctx.db, userId, {
        role,
        is_active: true,
        deleted_at: null,
      });
    } else {
      await repo.insertStaff(ctx.db, {
        auth_user_id: userId,
        role,
        display_name:
          (data.user.user_metadata as AccountMetadata)?.display_name || null,
        // `email` NOT NULL en base : un compte sans email échoue à l'insertion,
        // comme avant (écriture best-effort, non vérifiée).
        email: (data.user.email || null) as string,
      });
    }
  } else if (existingStaff?.id) {
    // Soft-delete : la ligne reste pour préserver staff_logs.staff_id
    // (restauration via /admin/recycle-bin).
    await repo.updateStaffByUser(ctx.db, userId, {
      is_active: false,
      deleted_at: new Date().toISOString(),
    });
  }

  if (previousStaffRole !== newStaffRole) {
    void emitRoleSyncEvent('staff.role.changed', userId, ctx.tenantId, {
      extras: { previousRole: previousStaffRole, newRole: newStaffRole },
    });
  }

  // Le staff dégradé/promu voit son nouveau rang dès la prochaine requête.
  invalidateStaffCache(userId);

  return {
    result: { success: true, user: toUserLite(data.user) },
    audit: {
      action: 'update_staff_role',
      entity_type: 'user',
      entity_id: userId,
      payload: {
        targetEmail: data.user.email ?? null,
        previousMetadataRole: target.metadataRole,
        newMetadataRole: role,
        previousStaffRole,
        newStaffRole,
      },
    },
  };
}

/* ---------------------------------------------------------------------------
 * DELETE /api/admin/users/manage — suppression définitive d'un compte
 * ------------------------------------------------------------------------ */

export async function deleteUser(
  ctx: ServiceContext,
  actor: AccountActor,
  body: { userId?: unknown }
): Promise<Audited<{ success: true }>> {
  const { userId } = body;
  if (!userId || typeof userId !== 'string')
    throw fail(400, 'userId required.');
  if (userId === actor.userId) {
    throw fail(403, 'You cannot delete your own account.');
  }

  const target = await loadTarget(ctx, userId);
  if (!target) throw fail(404, 'User not found.');
  if (target.isProtected && actor.role !== 'owner') {
    throw fail(403, 'Only an owner can delete an owner or admin account.');
  }
  if (target.staffRole === 'owner') await assertNotLastOwner(ctx, 'delete');

  await repo.deleteAllMemberships(ctx.db, userId);

  // L'émission staff.role.changed (newRole=null) PRÉCÈDE la suppression des
  // liens Discord (cascade du compte auth), sinon le bot ne résout plus
  // le discordUserId pour retirer le rôle.
  const wasStaffRole = target.staffRole;
  await repo.deleteStaffByUser(ctx.db, userId);
  if (wasStaffRole) {
    void emitRoleSyncEvent('staff.role.changed', userId, ctx.tenantId, {
      extras: { previousRole: wasStaffRole, newRole: null },
    });
  }

  const deletedEmail = target.user.email;
  if (deletedEmail) {
    sendAccountDeletedEmail(deletedEmail).catch((err) => {
      ctx.logger.error(
        '[admin/users/manage] account deleted email error:',
        err
      );
    });
  }

  const { error: deleteErr } = await ctx.db.auth.admin.deleteUser(userId);
  if (deleteErr) {
    ctx.logger.error('[admin/users/manage] delete error:', deleteErr);
    throw fail(500, 'Failed to delete user.');
  }

  invalidateStaffCache(userId);

  return {
    result: { success: true },
    audit: {
      entity_type: 'user',
      entity_id: userId,
      payload: {
        targetEmail: deletedEmail ?? null,
        previousMetadataRole: target.metadataRole,
        previousStaffRole: wasStaffRole,
      },
    },
  };
}
