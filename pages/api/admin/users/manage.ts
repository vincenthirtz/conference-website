import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import {
  withStaffRoute,
  invalidateStaffCache,
  STAFF_ROLE_RANK,
  STAFF_ROLES,
} from '@/utils/staff';
import type {
  AuthenticatedStaffContext,
  StaffRole,
} from '@/utils/staff';
import { sendAccountDeletedEmail, sendWelcomeEmail } from '@/utils/email';
import crypto from 'crypto';
import { applyRateLimit } from '@/utils/rateLimit';
import { emitRoleSyncEvent } from '@/utils/botRoleSync';
import { logStaffAction } from '@/utils/staffLogs';

import { logger } from '../../../../utils/logger';
type TeamMembership = {
  team_id: string;
  team_name: string;
  role: string;
  battle_tag: string | null;
};

type UserLite = {
  id: string;
  email: string | null;
  role: string | null;
  display_name: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  team_memberships?: TeamMembership[];
};

type ListResponse = {
  items: UserLite[];
  total: number;
};

type UpdateResponse = {
  success: boolean;
  user?: UserLite;
  error?: string;
  warning?: string;
};

export default withStaffRoute(handler, 'admin');

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ListResponse | UpdateResponse | { error: string }>,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 60, windowMs: 60_000 },
      'admin-users-manage'
    )
  )
    return;
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Service unavailable.' });
  }

  if (req.method === 'GET') {
    const {
      search,
      role: roleFilter,
      limit = '20',
      offset = '0',
    } = req.query;
    const lim = Math.max(1, Math.min(200, Number(limit) || 20));
    const off = Math.max(0, Number(offset) || 0);

    // Aggregate every auth user — listUsers paginates at perPage max 1000.
    // Loop until we get a short page (or empty), with a safety cap.
    type AuthUser = Awaited<
      ReturnType<typeof supabaseAdmin.auth.admin.listUsers>
    >['data']['users'][number];
    const allUsers: AuthUser[] = [];
    const perPage = 200;
    for (let pageNum = 1; pageNum <= 50; pageNum++) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({
        page: pageNum,
        perPage,
      });
      if (error) {
        logger.error('[admin/users/manage] list error:', error);
        return res.status(500).json({ error: 'Failed to load users.' });
      }
      const batch = data?.users ?? [];
      if (!batch.length) break;
      allUsers.push(...batch);
      if (batch.length < perPage) break;
    }

    const items: UserLite[] = allUsers.map((u) => ({
      id: u.id,
      email: u.email ?? null,
      role:
        ((u.user_metadata as any)?.role as string | null)?.toLowerCase() ??
        null,
      display_name: (u.user_metadata as any)?.display_name ?? null,
      created_at: u.created_at ?? null,
      last_sign_in_at: (u as { last_sign_in_at?: string | null })
        .last_sign_in_at ?? null,
    }));

    // Auto-fix roles with wrong casing in user_metadata
    for (const item of items) {
      const raw = (
        allUsers.find((u) => u.id === item.id)?.user_metadata as any
      )?.role;
      if (typeof raw === 'string' && raw !== raw.toLowerCase()) {
        await supabaseAdmin.auth.admin.updateUserById(item.id, {
          user_metadata: { role: raw.toLowerCase() },
        });
      }
    }

    const userIds = items.map((u) => u.id);
    const teamMembershipsMap = new Map<string, TeamMembership[]>();

    if (userIds.length) {
      // Fetch team memberships with battle_tag
      const { data: teamMembers, error: tmErr } = await supabaseAdmin
        .from('team_members')
        .select(
          `
          user_id,
          team_id,
          role,
          battle_tag,
          team:teams ( id, name )
        `
        )
        .in('user_id', userIds);

      if (!tmErr && teamMembers) {
        teamMembers.forEach((row: any) => {
          if (row?.user_id && row?.team) {
            const membership: TeamMembership = {
              team_id: row.team.id,
              team_name: row.team.name,
              role: row.role,
              battle_tag: row.battle_tag || null,
            };
            const existing = teamMembershipsMap.get(row.user_id) || [];
            existing.push(membership);
            teamMembershipsMap.set(row.user_id, existing);
          }
        });
      }
    }

    const enriched = items.map((u) => ({
      ...u,
      team_memberships: teamMembershipsMap.get(u.id) || [],
    }));

    const filtered = enriched.filter((u) => {
      if (roleFilter && typeof roleFilter === 'string' && roleFilter.trim()) {
        if ((u.role || '').toLowerCase() !== roleFilter.toLowerCase()) {
          return false;
        }
      }
      if (search && typeof search === 'string' && search.trim()) {
        const term = search.toLowerCase();
        const battleTagMatch = u.team_memberships?.some((tm) =>
          (tm.battle_tag || '').toLowerCase().includes(term)
        );
        const matched =
          (u.email || '').toLowerCase().includes(term) ||
          (u.display_name || '').toLowerCase().includes(term) ||
          (u.role || '').toLowerCase().includes(term) ||
          battleTagMatch;
        if (!matched) return false;
      }
      return true;
    });

    // Stable order: most recent first
    filtered.sort((a, b) => {
      const ta = a.created_at ? Date.parse(a.created_at) : 0;
      const tb = b.created_at ? Date.parse(b.created_at) : 0;
      return tb - ta;
    });

    const paged = filtered.slice(off, off + lim);
    return res.status(200).json({ items: paged, total: filtered.length });
  }

  if (req.method === 'PATCH') {
    const { userId, role: rawRole, teamId, battleTag } = req.body || {};
    const role = typeof rawRole === 'string' ? rawRole.toLowerCase() : rawRole;

    // Resend credentials: reset password and send welcome email
    if (userId && req.body.action === 'resend_credentials') {
      const { data: target, error: targetErr } =
        await supabaseAdmin.auth.admin.getUserById(userId);
      if (targetErr || !target?.user) {
        return res.status(404).json({ error: 'User not found.' });
      }

      const newPassword = generatePassword(16);
      const { error: updateErr } =
        await supabaseAdmin.auth.admin.updateUserById(userId, {
          password: newPassword,
        });

      if (updateErr) {
        logger.error('[admin/users/manage] reset password error:', updateErr);
        return res.status(500).json({ error: 'Failed to reset password.' });
      }

      const email = target.user.email;
      if (email) {
        const emailResult = await sendWelcomeEmail(email, newPassword);
        if (!emailResult.success) {
          logger.error('[admin/users/manage] email failed:', emailResult.error);
          return res.status(200).json({
            success: true,
            warning: `Mot de passe réinitialisé mais l'email n'a pas pu être envoyé : ${emailResult.error}`,
          });
        }
      }

      return res.status(200).json({ success: true });
    }

    // Special case: update battle_tag for a specific team membership
    if (userId && teamId && typeof battleTag === 'string') {
      // Validate battle_tag format
      const trimmedTag = battleTag.trim();
      if (trimmedTag) {
        const re = /^[A-Za-z0-9]{2,}#[0-9]{3,6}$/;
        if (!re.test(trimmedTag)) {
          return res.status(400).json({
            error: 'Invalid BattleTag (format Name#0000)',
          });
        }
      }

      const { error: updateErr } = await supabaseAdmin
        .from('team_members')
        .update({ battle_tag: trimmedTag || null })
        .eq('user_id', userId)
        .eq('team_id', teamId);

      if (updateErr) {
        logger.error(
          '[admin/users/manage] battle_tag update error:',
          updateErr
        );
        return res.status(500).json({ error: 'Failed to update BattleTag.' });
      }

      return res.status(200).json({ success: true });
    }

    // Handle display_name update
    if (
      userId &&
      typeof req.body.display_name === 'string' &&
      role === undefined
    ) {
      const { data: target, error: targetErr } =
        await supabaseAdmin.auth.admin.getUserById(userId);
      if (targetErr || !target?.user) {
        return res.status(404).json({ error: 'User not found.' });
      }

      const existingMeta = (target.user.user_metadata as any) || {};
      const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
        userId,
        {
          user_metadata: {
            ...existingMeta,
            display_name: req.body.display_name.trim() || null,
          },
        }
      );

      if (error || !data?.user) {
        logger.error('[admin/users/manage] display_name update error:', error);
        return res
          .status(500)
          .json({ error: 'Failed to update display name.' });
      }

      // Sync staff display_name if exists
      const { data: existingStaff } = await supabaseAdmin
        .from('staff')
        .select('id')
        .eq('auth_user_id', userId)
        .maybeSingle();
      if (existingStaff?.id) {
        await supabaseAdmin
          .from('staff')
          .update({ display_name: req.body.display_name.trim() || null })
          .eq('auth_user_id', userId);
        invalidateStaffCache(userId);
      }

      const u = data.user;
      return res.status(200).json({
        success: true,
        user: {
          id: u.id,
          email: u.email ?? null,
          role: (u.user_metadata as any)?.role ?? null,
          display_name: (u.user_metadata as any)?.display_name ?? null,
          created_at: u.created_at ?? null,
          last_sign_in_at:
            (u as { last_sign_in_at?: string | null }).last_sign_in_at ?? null,
        },
      });
    }

    if (!userId || typeof role !== 'string') {
      return res.status(400).json({ error: 'userId and role required.' });
    }

    // Self role change interdit (un admin ne peut pas se rétrograder lui-même,
    // ce qui le déconnecterait du back-office en plein milieu d'une action).
    if (userId === ctx.user.id) {
      return res
        .status(403)
        .json({ error: 'You cannot change your own role.' });
    }

    // Récupérer le compte cible (pour vérifier son rôle actuel)
    const { data: target, error: targetErr } =
      await supabaseAdmin.auth.admin.getUserById(userId);
    if (targetErr || !target?.user) {
      logger.error('[admin/users/manage] get target error:', targetErr);
      return res
        .status(404)
        .json({ error: 'Target user not found or inaccessible.' });
    }

    const targetRole = (target.user.user_metadata as any)?.role ?? null;
    let targetStaffRole: string | null = null;
    const { data: targetStaff } = await supabaseAdmin
      .from('staff')
      .select('role')
      .eq('auth_user_id', userId)
      .maybeSingle();
    if (targetStaff?.role) targetStaffRole = targetStaff.role;

    // Seul un owner peut modifier un owner ou un admin
    const requesterRole = ctx.staff?.role ?? null;
    const targetIsProtected =
      targetRole === 'owner' ||
      targetRole === 'admin' ||
      targetStaffRole === 'owner' ||
      targetStaffRole === 'admin';

    if (targetIsProtected && requesterRole !== 'owner') {
      return res.status(403).json({
        error:
          'Only an owner can modify an owner or admin account. Action denied.',
      });
    }

    // Anti-escalade: empêche un non-owner d'octroyer un rôle staff >= au sien.
    // Un rôle non-staff (ex: 'player', 'member', '') sort de STAFF_ROLE_RANK
    // et passe librement — c'est le comportement voulu (révocation autorisée).
    const isStaffTargetRole = (STAFF_ROLES as readonly string[]).includes(role);
    if (isStaffTargetRole && requesterRole !== 'owner') {
      const newRank = STAFF_ROLE_RANK[role as StaffRole];
      const requesterRank = requesterRole
        ? STAFF_ROLE_RANK[requesterRole as StaffRole]
        : -1;
      if (newRank >= requesterRank) {
        return res.status(403).json({
          error:
            'You cannot grant a role equal to or above your own. Action denied.',
        });
      }
    }

    // Garde "last owner": si la cible est owner et qu'on la dégrade,
    // refuser si c'est le dernier owner restant.
    const targetWasOwner = targetStaffRole === 'owner';
    if (targetWasOwner && role !== 'owner') {
      const { count: ownerCount, error: ownerCountErr } = await supabaseAdmin
        .from('staff')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'owner');
      if (ownerCountErr) {
        logger.error(
          '[admin/users/manage] owner count error:',
          ownerCountErr
        );
        return res
          .status(500)
          .json({ error: 'Failed to verify owner count.' });
      }
      if ((ownerCount ?? 0) <= 1) {
        return res.status(409).json({
          error:
            'Cannot demote the last owner. Promote another user to owner first.',
        });
      }
    }

    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      {
        user_metadata: { role },
      }
    );

    if (error || !data?.user) {
      logger.error('[admin/users/manage] update error:', error);
      return res.status(500).json({ error: 'Failed to update user.' });
    }

    // Synchroniser la table staff selon le rôle
    const isStaffRole = (STAFF_ROLES as readonly string[]).includes(role);

    const { data: existingStaff } = await supabaseAdmin
      .from('staff')
      .select('id, role')
      .eq('auth_user_id', userId)
      .maybeSingle();

    const previousStaffRole = existingStaff?.role ?? null;
    let newStaffRole: string | null = null;

    if (isStaffRole) {
      newStaffRole = role;
      // Ajouter ou mettre à jour l'entrée staff. Si elle existait soft-deleted,
      // on la réactive (is_active=true, deleted_at=null).
      if (existingStaff?.id) {
        await supabaseAdmin
          .from('staff')
          .update({ role, is_active: true, deleted_at: null })
          .eq('auth_user_id', userId);
      } else {
        await supabaseAdmin.from('staff').insert({
          auth_user_id: userId,
          role,
          display_name: (data.user.user_metadata as any)?.display_name || null,
          email: data.user.email || null,
        });
      }
    } else if (existingStaff?.id) {
      // Soft-delete : on conserve la row pour préserver staff_logs.staff_id.
      // La row sera filtrée par getStaffByUserId via is_active/deleted_at.
      // Restore possible via /admin/recycle-bin.
      await supabaseAdmin
        .from('staff')
        .update({
          is_active: false,
          deleted_at: new Date().toISOString(),
        })
        .eq('auth_user_id', userId);
    }

    if (previousStaffRole !== newStaffRole) {
      // emitRoleSyncEvent enrichit le payload avec discordUserId + team +
      // staffRole résolus depuis la DB (voir utils/botRoleSync.ts).
      // No-op si l'utilisateur n'a pas lié son Discord.
      void emitRoleSyncEvent('staff.role.changed', userId, ctx.tenantId, {
        extras: { previousRole: previousStaffRole, newRole: newStaffRole },
      });
    }

    // Invalide le cache pour que le staff dégradé/promu voie son nouveau rang
    // dès la prochaine requête (sans attendre les 5min du TTL).
    invalidateStaffCache(userId);

    void logStaffAction({
      staff_id: ctx.staff.id,
      action: 'update_staff_role',
      entity_type: 'user',
      entity_id: userId,
      payload: {
        targetEmail: data.user.email ?? null,
        previousMetadataRole: targetRole,
        newMetadataRole: role,
        previousStaffRole,
        newStaffRole,
      },
    });

    const u = data.user;
    const userLite: UserLite = {
      id: u.id,
      email: u.email ?? null,
      role: (u.user_metadata as any)?.role ?? null,
      display_name: (u.user_metadata as any)?.display_name ?? null,
      last_sign_in_at:
        (u as { last_sign_in_at?: string | null }).last_sign_in_at ?? null,
      created_at: u.created_at ?? null,
    };

    return res.status(200).json({ success: true, user: userLite });
  }

  if (req.method === 'DELETE') {
    const { userId } = req.body || {};

    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ error: 'userId required.' });
    }

    // Self-delete interdit (un admin ne peut pas se supprimer lui-même).
    if (userId === ctx.user.id) {
      return res
        .status(403)
        .json({ error: 'You cannot delete your own account.' });
    }

    // Fetch target to check protection
    const { data: target, error: targetErr } =
      await supabaseAdmin.auth.admin.getUserById(userId);
    if (targetErr || !target?.user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const targetRole = (target.user.user_metadata as any)?.role ?? null;
    let targetStaffRole: string | null = null;
    const { data: targetStaff } = await supabaseAdmin
      .from('staff')
      .select('role')
      .eq('auth_user_id', userId)
      .maybeSingle();
    if (targetStaff?.role) targetStaffRole = targetStaff.role;

    const requesterRole = ctx.staff?.role ?? null;
    const targetIsProtected =
      targetRole === 'owner' ||
      targetRole === 'admin' ||
      targetStaffRole === 'owner' ||
      targetStaffRole === 'admin';

    if (targetIsProtected && requesterRole !== 'owner') {
      return res.status(403).json({
        error: 'Only an owner can delete an owner or admin account.',
      });
    }

    // Garde "last owner": refuser de supprimer le dernier owner.
    if (targetStaffRole === 'owner') {
      const { count: ownerCount, error: ownerCountErr } = await supabaseAdmin
        .from('staff')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'owner');
      if (ownerCountErr) {
        logger.error(
          '[admin/users/manage] owner count error:',
          ownerCountErr
        );
        return res
          .status(500)
          .json({ error: 'Failed to verify owner count.' });
      }
      if ((ownerCount ?? 0) <= 1) {
        return res.status(409).json({
          error:
            'Cannot delete the last owner. Promote another user to owner first.',
        });
      }
    }

    // Remove team memberships
    await supabaseAdmin.from('team_members').delete().eq('user_id', userId);

    // Remove staff entry if exists — émet staff.role.changed (newRole=null)
    // si l'utilisateur était staff, pour que le bot retire le rôle Discord.
    // L'emit DOIT être fait AVANT le delete des liens Discord (le auth user
    // delete cascade éventuellement les rows user_discord_links), sinon
    // emitRoleSyncEvent ne pourra plus résoudre le discordUserId.
    const wasStaffRole = targetStaffRole;
    await supabaseAdmin.from('staff').delete().eq('auth_user_id', userId);
    if (wasStaffRole) {
      void emitRoleSyncEvent('staff.role.changed', userId, ctx.tenantId, {
        extras: { previousRole: wasStaffRole, newRole: null },
      });
    }

    // Send account deleted email before deleting (non-blocking)
    const deletedEmail = target.user.email;
    if (deletedEmail) {
      sendAccountDeletedEmail(deletedEmail).catch((err) => {
        logger.error('[admin/users/manage] account deleted email error:', err);
      });
    }

    // Delete auth user
    const { error: deleteErr } =
      await supabaseAdmin.auth.admin.deleteUser(userId);
    if (deleteErr) {
      logger.error('[admin/users/manage] delete error:', deleteErr);
      return res.status(500).json({ error: 'Failed to delete user.' });
    }

    // Le compte est supprimé : invalide tout cache résiduel (staff + token).
    invalidateStaffCache(userId);

    void logStaffAction({
      staff_id: ctx.staff.id,
      action: 'delete_staff_account',
      entity_type: 'user',
      entity_id: userId,
      payload: {
        targetEmail: deletedEmail ?? null,
        previousMetadataRole: targetRole,
        previousStaffRole: wasStaffRole,
      },
    });

    return res.status(200).json({ success: true });
  }

  res.setHeader('Allow', 'GET,PATCH,DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}

function generatePassword(length = 16) {
  const alphabet =
    'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz0123456789!@$%^*';
  // Use rejection sampling to avoid modulo bias
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
