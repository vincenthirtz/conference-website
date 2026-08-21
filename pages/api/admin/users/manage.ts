import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import {
  withStaffRoute,
  invalidateStaffCache,
  STAFF_ROLE_RANK,
  STAFF_ROLES,
} from '@/utils/staff';
import type { AuthenticatedStaffContext, StaffRole } from '@/utils/staff';
import { sendAccountDeletedEmail, sendWelcomeEmail } from '@/utils/email';
import crypto from 'crypto';
import { applyRateLimit } from '@/utils/rateLimit';
import { emitRoleSyncEvent } from '@/utils/botRoleSync';
import { logStaffAction } from '@/utils/staffLogs';
import { computeBattleTagMismatch } from '@/utils/auth/battleTagMismatch';

import { logger } from '../../../../utils/logger';
type TeamMembership = {
  team_id: string;
  team_name: string;
  role: string;
  battle_tag: string | null;
  /** Horodatage de vérif OAuth Battle.net (NULL = non vérifié → source du badge). */
  battle_tag_verified_at: string | null;
  /**
   * Flag d'alerte anti-smurf : le compte Blizzard vérifié de la joueuse ne
   * correspond pas au battle_tag du roster (usurpation / faute de frappe à
   * investiguer). Calculé côté serveur (cf. GET).
   */
  battle_tag_mismatch: boolean;
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
  /**
   * Renvoyé par le PATCH battle_tag : état de la ligne de roster APRÈS
   * écriture (la vérification Battle.net est invalidée par une édition
   * manuelle), pour que le client rafraîchisse ses pastilles sans refetch.
   */
  membership?: {
    team_id: string;
    battle_tag: string | null;
    battle_tag_verified_at: string | null;
    battle_tag_mismatch: boolean;
  };
  error?: string;
  warning?: string;
};

type TargetAccount = {
  user: NonNullable<
    Awaited<
      ReturnType<typeof supabaseAdmin.auth.admin.getUserById>
    >['data']['user']
  >;
  metadataRole: string | null;
  staffRole: string | null;
  /** owner/admin (rôle de compte OU row staff) → seul un owner peut y toucher. */
  isProtected: boolean;
};

/**
 * Charge le compte cible + calcule la garde « owner/admin protégé ».
 *
 * Factorisé pour que TOUTES les écritures de ce handler en héritent, et pas
 * seulement le changement de rôle et la suppression : réinitialiser le mot de
 * passe d'un owner (`resend_credentials`) ou le renommer, c'est agir sur un
 * compte plus puissant que le sien.
 */
async function loadTarget(userId: string): Promise<TargetAccount | null> {
  const { data: target, error } =
    await supabaseAdmin.auth.admin.getUserById(userId);
  if (error || !target?.user) return null;

  const metadataRole = (target.user.user_metadata as any)?.role ?? null;
  const { data: targetStaff } = await supabaseAdmin
    .from('staff')
    .select('role')
    .eq('auth_user_id', userId)
    .maybeSingle();
  const staffRole = targetStaff?.role ?? null;

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
      sort,
      dir,
    } = req.query;
    const lim = Math.max(1, Math.min(200, Number(limit) || 20));
    const off = Math.max(0, Number(offset) || 0);

    // Tri whitelisté côté handler (la RPC re-valide via CASE, mais on évite
    // d'envoyer n'importe quoi). Défaut = created_at DESC (comportement legacy).
    const SORT_FIELDS = new Set([
      'created_at',
      'display_name',
      'email',
      'role',
      'last_sign_in_at',
    ]);
    const sortField =
      typeof sort === 'string' && SORT_FIELDS.has(sort) ? sort : 'created_at';
    const sortDir = dir === 'asc' ? 'asc' : 'desc';

    // Perf P1 : pagination / recherche / filtre côté SQL via la RPC
    // `admin_list_users`. Elle applique déjà le filtre rôle (égalité
    // insensible à la casse sur user_metadata.role), la recherche sur
    // email / display_name / role + battle_tag (EXISTS team_members), le tri
    // created_at DESC, le LIMIT/OFFSET et expose total_count = count(*) OVER()
    // sur l'ensemble filtré. On n'agrège plus tous les comptes auth en mémoire.
    const normParam = (v: unknown): string | null => {
      if (typeof v !== 'string') return null;
      const t = v.trim();
      return t ? t : null;
    };

    const { data, error } = await supabaseAdmin.rpc('admin_list_users', {
      p_query: normParam(search),
      p_role: normParam(roleFilter),
      p_limit: lim,
      p_offset: off,
      p_sort: sortField,
      p_dir: sortDir,
    });

    if (error) {
      logger.error('[admin/users/manage] list error:', error);
      return res.status(500).json({ error: 'Failed to load users.' });
    }

    type RpcRow = {
      id: string;
      email: string | null;
      role: string | null;
      display_name: string | null;
      created_at: string | null;
      last_sign_in_at: string | null;
      total_count: number | string | null;
    };
    const rows = (data ?? []) as RpcRow[];
    const total = Number(rows[0]?.total_count ?? 0);

    // Normalize role casing for display parity with the previous handler.
    const items: UserLite[] = rows.map((row) => ({
      id: row.id,
      email: row.email ?? null,
      role: row.role?.toLowerCase() ?? null,
      display_name: row.display_name ?? null,
      created_at: row.created_at ?? null,
      last_sign_in_at: row.last_sign_in_at ?? null,
    }));

    // Enrich team_memberships ONLY for the user ids on THIS page (≤ lim ids →
    // cheap). Same SELECT + shape as before.
    const pageUserIds = items.map((u) => u.id);
    const teamMembershipsMap = new Map<string, TeamMembership[]>();

    if (pageUserIds.length) {
      // Lien identité Battle.net vérifié des joueuses de la page (service-role).
      // Sert à détecter un mismatch « compte vérifié ≠ tag roster » sans
      // rejoindre la table à chaque rendu. Best-effort : en cas d'erreur on
      // n'échoue pas la liste, on n'affiche simplement pas le flag de mismatch.
      const linkedTagByUser = new Map<string, string>();
      const { data: bnetLinks } = await supabaseAdmin
        .from('user_battlenet_links')
        .select('auth_user_id, battle_tag')
        .in('auth_user_id', pageUserIds);
      (bnetLinks ?? []).forEach((row: any) => {
        if (row?.auth_user_id && row?.battle_tag) {
          linkedTagByUser.set(row.auth_user_id, String(row.battle_tag));
        }
      });

      const { data: teamMembers, error: tmErr } = await supabaseAdmin
        .from('team_members')
        .select(
          `
          user_id,
          team_id,
          role,
          battle_tag,
          battle_tag_verified_at,
          verified_battle_net_id,
          team:teams ( id, name )
        `
        )
        .in('user_id', pageUserIds);

      if (!tmErr && teamMembers) {
        teamMembers.forEach((row: any) => {
          if (row?.user_id && row?.team) {
            const membership: TeamMembership = {
              team_id: row.team.id,
              team_name: row.team.name,
              role: row.role,
              battle_tag: row.battle_tag || null,
              battle_tag_verified_at: row.battle_tag_verified_at || null,
              battle_tag_mismatch: computeBattleTagMismatch({
                battleTag: row.battle_tag || null,
                verifiedAt: row.battle_tag_verified_at || null,
                verifiedBattleNetId: row.verified_battle_net_id || null,
                linkedTag: linkedTagByUser.get(row.user_id) ?? null,
              }),
            };
            const existing = teamMembershipsMap.get(row.user_id) || [];
            existing.push(membership);
            teamMembershipsMap.set(row.user_id, existing);
          }
        });
      }
    }

    const enriched: UserLite[] = items.map((u) => ({
      ...u,
      team_memberships: teamMembershipsMap.get(u.id) || [],
    }));

    return res.status(200).json({ items: enriched, total });
  }

  if (req.method === 'PATCH') {
    const { userId, role: rawRole, teamId, battleTag } = req.body || {};
    const role = typeof rawRole === 'string' ? rawRole.toLowerCase() : rawRole;

    // Resend credentials: reset password and send welcome email
    if (userId && req.body.action === 'resend_credentials') {
      const target = await loadTarget(userId);
      if (!target) {
        return res.status(404).json({ error: 'User not found.' });
      }

      // Même garde que le PATCH rôle / DELETE : réinitialiser le mot de passe
      // d'un owner ou d'un admin l'éjecte de son propre compte. Seul un owner
      // peut le faire — chacun reste libre de relancer ses propres accès.
      if (
        target.isProtected &&
        (ctx.staff?.role ?? null) !== 'owner' &&
        userId !== ctx.user.id
      ) {
        return res.status(403).json({
          error:
            'Only an owner can reset the credentials of an owner or admin account.',
        });
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

      // Audité AVANT l'envoi : le mot de passe est déjà changé, l'échec mail
      // ne doit pas faire disparaître la trace de qui a réinitialisé quoi.
      void logStaffAction({
        staff_id: ctx.staff.id,
        action: 'resend_credentials',
        entity_type: 'user',
        entity_id: userId,
        tenant_id: ctx.tenantId,
        payload: {
          targetEmail: email ?? null,
          targetMetadataRole: target.metadataRole,
          targetStaffRole: target.staffRole,
        },
      });

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

      // La ligne DOIT exister : sans ce SELECT, un teamId erroné répondait
      // `success` alors que l'UPDATE ne touchait aucune ligne.
      const { data: membership, error: memberErr } = await supabaseAdmin
        .from('team_members')
        .select(
          'id, tenant_id, battle_tag, battle_tag_verified_at, verified_battle_net_id'
        )
        .eq('user_id', userId)
        .eq('team_id', teamId)
        .maybeSingle();

      if (memberErr) {
        logger.error('[admin/users/manage] membership lookup error:', memberErr);
        return res.status(500).json({ error: 'Failed to load membership.' });
      }
      if (!membership) {
        return res.status(404).json({ error: 'Team membership not found.' });
      }

      // Défense en profondeur : pas d'écriture sur le roster d'un autre tenant.
      // Les lignes historiques sans tenant_id restent modifiables (fail-open
      // volontaire, cf. le TODO tenant de staff_logs).
      if (membership.tenant_id && membership.tenant_id !== ctx.tenantId) {
        return res
          .status(403)
          .json({ error: 'This membership belongs to another tenant.' });
      }

      const previousTag = membership.battle_tag || null;
      const nextTag = trimmedTag || null;
      const tagChanged =
        (previousTag ?? '').toLowerCase() !== (nextTag ?? '').toLowerCase();

      // Une édition manuelle INVALIDE la vérification Battle.net : sans ça la
      // pastille « ✓ vérifié » restait collée à un tag que personne n'a jamais
      // vérifié (faux négatif anti-smurf : le mismatch ne se déclenche que si
      // la joueuse a par ailleurs un lien Battle.net).
      const updatePayload: Record<string, unknown> = { battle_tag: nextTag };
      if (tagChanged) {
        updatePayload.battle_tag_verified_at = null;
        updatePayload.verified_battle_net_id = null;
      }

      const { error: updateErr } = await supabaseAdmin
        .from('team_members')
        .update(updatePayload)
        .eq('id', membership.id);

      if (updateErr) {
        logger.error(
          '[admin/users/manage] battle_tag update error:',
          updateErr
        );
        return res.status(500).json({ error: 'Failed to update BattleTag.' });
      }

      if (tagChanged) {
        // Même slug que /api/teams/update-member : les deux chemins d'édition
        // du tag atterrissent dans le même journal.
        void logStaffAction({
          staff_id: ctx.staff.id,
          action: 'update_player_battle_tag',
          entity_type: 'team_member',
          entity_id: membership.id,
          tenant_id: ctx.tenantId,
          payload: {
            user_id: userId,
            team_id: teamId,
            previous: previousTag,
            next: nextTag,
            verification_reset: true,
          },
        });
      }

      // État post-écriture renvoyé au client (pastilles vérifié / mismatch).
      const { data: bnetLink } = await supabaseAdmin
        .from('user_battlenet_links')
        .select('battle_tag')
        .eq('auth_user_id', userId)
        .limit(1);
      const linkedTag = (bnetLink as any)?.[0]?.battle_tag ?? null;

      const verifiedAt = tagChanged
        ? null
        : membership.battle_tag_verified_at || null;
      const verifiedBattleNetId = tagChanged
        ? null
        : membership.verified_battle_net_id || null;

      return res.status(200).json({
        success: true,
        membership: {
          team_id: String(teamId),
          battle_tag: nextTag,
          battle_tag_verified_at: verifiedAt,
          battle_tag_mismatch: computeBattleTagMismatch({
            battleTag: nextTag,
            verifiedAt,
            verifiedBattleNetId,
            linkedTag,
          }),
        },
      });
    }

    // Handle display_name update
    if (
      userId &&
      typeof req.body.display_name === 'string' &&
      role === undefined
    ) {
      const target = await loadTarget(userId);
      if (!target) {
        return res.status(404).json({ error: 'User not found.' });
      }

      // Renommer un owner/admin (usurpation d'identité dans les journaux et
      // les listes) suit la même règle que les autres écritures. On garde
      // évidemment le droit de renommer SON propre compte.
      if (
        target.isProtected &&
        (ctx.staff?.role ?? null) !== 'owner' &&
        userId !== ctx.user.id
      ) {
        return res.status(403).json({
          error: 'Only an owner can modify an owner or admin account.',
        });
      }

      const existingMeta = (target.user.user_metadata as any) || {};
      const previousDisplayName = existingMeta.display_name ?? null;
      const nextDisplayName = req.body.display_name.trim() || null;

      const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
        userId,
        {
          user_metadata: {
            ...existingMeta,
            display_name: nextDisplayName,
          },
        }
      );

      if (error || !data?.user) {
        logger.error('[admin/users/manage] display_name update error:', error);
        return res
          .status(500)
          .json({ error: 'Failed to update display name.' });
      }

      void logStaffAction({
        staff_id: ctx.staff.id,
        action: 'update_member_profile',
        entity_type: 'user',
        entity_id: userId,
        tenant_id: ctx.tenantId,
        payload: {
          field: 'display_name',
          previous: previousDisplayName,
          next: nextDisplayName,
        },
      });

      // Sync staff display_name if exists
      const { data: existingStaff } = await supabaseAdmin
        .from('staff')
        .select('id')
        .eq('auth_user_id', userId)
        .maybeSingle();
      if (existingStaff?.id) {
        await supabaseAdmin
          .from('staff')
          .update({ display_name: nextDisplayName })
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
    const target = await loadTarget(userId);
    if (!target) {
      logger.error('[admin/users/manage] get target error:', userId);
      return res
        .status(404)
        .json({ error: 'Target user not found or inaccessible.' });
    }

    const targetRole = target.metadataRole;
    const targetStaffRole = target.staffRole;

    // Seul un owner peut modifier un owner ou un admin
    const requesterRole = ctx.staff?.role ?? null;

    if (target.isProtected && requesterRole !== 'owner') {
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
        logger.error('[admin/users/manage] owner count error:', ownerCountErr);
        return res.status(500).json({ error: 'Failed to verify owner count.' });
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
    const target = await loadTarget(userId);
    if (!target) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const targetRole = target.metadataRole;
    const targetStaffRole = target.staffRole;
    const requesterRole = ctx.staff?.role ?? null;

    if (target.isProtected && requesterRole !== 'owner') {
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
        logger.error('[admin/users/manage] owner count error:', ownerCountErr);
        return res.status(500).json({ error: 'Failed to verify owner count.' });
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
