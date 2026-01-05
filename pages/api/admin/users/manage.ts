import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';

type UserLite = {
  id: string;
  email: string | null;
  role: string | null;
  display_name: string | null;
  created_at: string | null;
  staff_role?: string | null;
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
    let staffMap = new Map<string, string>();
    if (userIds.length) {
      const { data: staffRows, error: staffErr } = await supabaseAdmin
        .from('staff')
        .select('auth_user_id, role')
        .in('auth_user_id', userIds);

      if (!staffErr && staffRows) {
        staffRows.forEach((row: any) => {
          if (row?.auth_user_id) staffMap.set(row.auth_user_id, row.role);
        });
      }
    }

    const filtered = items
      .map((u) => ({ ...u, staff_role: staffMap.get(u.id) || null }))
      .filter((u) => {
        if (!search || Array.isArray(search)) return true;
        const term = search.toLowerCase();
        return (
          (u.email || '').toLowerCase().includes(term) ||
          (u.display_name || '').toLowerCase().includes(term) ||
          (u.role || '').toLowerCase().includes(term) ||
          (u.staff_role || '').toLowerCase().includes(term)
        );
      });

    return res.status(200).json({ items: filtered, total: filtered.length });
  }

  if (req.method === 'PATCH') {
    const { userId, role, staffRole } = req.body || {};
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

    // Optionnel : raccorder à la table staff si staffRole est fourni
    if (staffRole && typeof staffRole === 'string') {
      const { data: existing } = await supabaseAdmin
        .from('staff')
        .select('id')
        .eq('auth_user_id', userId)
        .maybeSingle();

      if (existing?.id) {
        await supabaseAdmin
          .from('staff')
          .update({ role: staffRole })
          .eq('auth_user_id', userId);
      } else {
        await supabaseAdmin.from('staff').insert({
          auth_user_id: userId,
          role: staffRole,
          display_name: (data.user.user_metadata as any)?.display_name || null,
          email: data.user.email || null,
        });
      }
    }

    const u = data.user;
    const userLite: UserLite = {
      id: u.id,
      email: u.email ?? null,
      role: (u.user_metadata as any)?.role ?? null,
      display_name: (u.user_metadata as any)?.display_name ?? null,
      created_at: u.created_at ?? null,
      staff_role: staffRole || null,
    };

    return res.status(200).json({ success: true, user: userLite });
  }

  res.setHeader('Allow', 'GET,PATCH');
  return res.status(405).json({ error: 'Method not allowed' });
}
