import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';

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
  res: NextApiResponse<ListResponse | UpdateResponse | { error: string }>
) {
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase admin non configuré.' });
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
        .json({ error: 'Impossible de charger les utilisateurs.' });
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

    // Special case: update battle_tag for a specific team membership
    if (userId && teamId && typeof battleTag === 'string') {
      // Validate battle_tag format
      const trimmedTag = battleTag.trim();
      if (trimmedTag) {
        const re = /^[A-Za-z0-9]{2,}#[0-9]{3,6}$/;
        if (!re.test(trimmedTag)) {
          return res.status(400).json({
            error: 'BattleTag invalide (format Pseudo#0000)',
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
        return res.status(500).json({ error: 'Impossible de mettre à jour le BattleTag.' });
      }

      return res.status(200).json({ success: true });
    }

    if (!userId || typeof role !== 'string') {
      return res.status(400).json({ error: 'userId et role requis.' });
    }

    // Récupérer le compte cible (pour vérifier son rôle actuel)
    const { data: target, error: targetErr } =
      await supabaseAdmin.auth.admin.getUserById(userId);
    if (targetErr || !target?.user) {
      console.error('[admin/users/manage] get target error:', targetErr);
      return res
        .status(404)
        .json({ error: "Utilisateur cible introuvable ou inaccessible." });
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
    const requesterRole = (req as any)?.context?.staff?.role || null;
    const targetIsProtected =
      targetRole === 'owner' ||
      targetRole === 'admin' ||
      targetStaffRole === 'owner' ||
      targetStaffRole === 'admin';

    if (targetIsProtected && requesterRole !== 'owner') {
      return res.status(403).json({
        error:
          'Seul un owner peut modifier un compte owner ou admin. Action refusée.',
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
        .json({ error: "Impossible de mettre à jour l'utilisateur." });
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

  res.setHeader('Allow', 'GET,PATCH');
  return res.status(405).json({ error: 'Method not allowed' });
}
