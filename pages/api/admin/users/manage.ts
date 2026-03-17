import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';
import type { StaffContext } from '@/utils/staff';
import { sendAccountDeletedEmail, sendWelcomeEmail } from '@/utils/email';
import crypto from 'crypto';

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
};

export default withStaffRoute(handler, 'admin');

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ListResponse | UpdateResponse | { error: string }>,
  ctx: StaffContext
) {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Service unavailable.' });
  }

  if (req.method === 'GET') {
    const { search, limit = '200', page = '1' } = req.query;
    const perPage = Math.max(1, Math.min(200, Number(limit) || 200));
    const pageNum = Math.max(1, Number(page) || 1);

    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page: pageNum,
      perPage,
    });

    if (error) {
      console.error('[admin/users/manage] list error:', error);
      return res
        .status(500)
        .json({ error: 'Failed to load users.' });
    }

    const items =
      data?.users
        ?.map((u) => ({
          id: u.id,
          email: u.email ?? null,
          role: (u.user_metadata as any)?.role ?? null,
          display_name: (u.user_metadata as any)?.display_name ?? null,
          created_at: u.created_at ?? null,
        })) ?? [];

    const userIds = items.map((u) => u.id);
    const teamMembershipsMap = new Map<string, TeamMembership[]>();

    if (userIds.length) {
      // Fetch team memberships with battle_tag
      const { data: teamMembers, error: tmErr } = await supabaseAdmin
        .from('team_members')
        .select(`
          user_id,
          team_id,
          role,
          battle_tag,
          team:teams ( id, name )
        `)
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

    const filtered = items
      .map((u) => ({
        ...u,
        team_memberships: teamMembershipsMap.get(u.id) || [],
      }))
      .filter((u) => {
        if (!search || Array.isArray(search)) return true;
        const term = search.toLowerCase();
        const battleTagMatch = u.team_memberships?.some(
          (tm) => (tm.battle_tag || '').toLowerCase().includes(term)
        );
        return (
          (u.email || '').toLowerCase().includes(term) ||
          (u.display_name || '').toLowerCase().includes(term) ||
          (u.role || '').toLowerCase().includes(term) ||
          battleTagMatch
        );
      });

    return res.status(200).json({ items: filtered, total: filtered.length });
  }

  if (req.method === 'PATCH') {
    const { userId, role, teamId, battleTag } = req.body || {};

    // Resend credentials: reset password and send welcome email
    if (userId && req.body.action === 'resend_credentials') {
      const { data: target, error: targetErr } =
        await supabaseAdmin.auth.admin.getUserById(userId);
      if (targetErr || !target?.user) {
        return res.status(404).json({ error: 'User not found.' });
      }

      const newPassword = generatePassword(16);
      const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(
        userId,
        { password: newPassword }
      );

      if (updateErr) {
        console.error('[admin/users/manage] reset password error:', updateErr);
        return res.status(500).json({ error: 'Failed to reset password.' });
      }

      const email = target.user.email;
      if (email) {
        await sendWelcomeEmail(email, newPassword);
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
        console.error('[admin/users/manage] battle_tag update error:', updateErr);
        return res.status(500).json({ error: 'Failed to update BattleTag.' });
      }

      return res.status(200).json({ success: true });
    }

    // Handle display_name update
    if (userId && typeof req.body.display_name === 'string' && role === undefined) {
      const { data: target, error: targetErr } =
        await supabaseAdmin.auth.admin.getUserById(userId);
      if (targetErr || !target?.user) {
        return res.status(404).json({ error: 'User not found.' });
      }

      const existingMeta = (target.user.user_metadata as any) || {};
      const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
        userId,
        { user_metadata: { ...existingMeta, display_name: req.body.display_name.trim() || null } }
      );

      if (error || !data?.user) {
        console.error('[admin/users/manage] display_name update error:', error);
        return res.status(500).json({ error: 'Failed to update display name.' });
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
        },
      });
    }

    if (!userId || typeof role !== 'string') {
      return res.status(400).json({ error: 'userId and role required.' });
    }

    // Récupérer le compte cible (pour vérifier son rôle actuel)
    const { data: target, error: targetErr } =
      await supabaseAdmin.auth.admin.getUserById(userId);
    if (targetErr || !target?.user) {
      console.error('[admin/users/manage] get target error:', targetErr);
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

    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      {
        user_metadata: { role },
      }
    );

    if (error || !data?.user) {
      console.error('[admin/users/manage] update error:', error);
      return res
        .status(500)
        .json({ error: 'Failed to update user.' });
    }

    // Synchroniser la table staff selon le rôle
    const STAFF_ROLES = ['caster', 'manager', 'admin', 'owner'];
    const isStaffRole = STAFF_ROLES.includes(role);

    const { data: existingStaff } = await supabaseAdmin
      .from('staff')
      .select('id')
      .eq('auth_user_id', userId)
      .maybeSingle();

    if (isStaffRole) {
      // Ajouter ou mettre à jour l'entrée staff
      if (existingStaff?.id) {
        await supabaseAdmin
          .from('staff')
          .update({ role })
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
      // Supprimer l'entrée staff si le rôle n'est plus un rôle staff
      await supabaseAdmin
        .from('staff')
        .delete()
        .eq('auth_user_id', userId);
    }

    const u = data.user;
    const userLite: UserLite = {
      id: u.id,
      email: u.email ?? null,
      role: (u.user_metadata as any)?.role ?? null,
      display_name: (u.user_metadata as any)?.display_name ?? null,
      created_at: u.created_at ?? null,
    };

    return res.status(200).json({ success: true, user: userLite });
  }

  if (req.method === 'DELETE') {
    const { userId } = req.body || {};

    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ error: 'userId required.' });
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

    // Remove team memberships
    await supabaseAdmin
      .from('team_members')
      .delete()
      .eq('user_id', userId);

    // Remove staff entry if exists
    await supabaseAdmin
      .from('staff')
      .delete()
      .eq('auth_user_id', userId);

    // Send account deleted email before deleting (non-blocking)
    const deletedEmail = target.user.email;
    if (deletedEmail) {
      sendAccountDeletedEmail(deletedEmail).catch((err) => {
        console.error('[admin/users/manage] account deleted email error:', err);
      });
    }

    // Delete auth user
    const { error: deleteErr } =
      await supabaseAdmin.auth.admin.deleteUser(userId);
    if (deleteErr) {
      console.error('[admin/users/manage] delete error:', deleteErr);
      return res.status(500).json({ error: 'Failed to delete user.' });
    }

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
