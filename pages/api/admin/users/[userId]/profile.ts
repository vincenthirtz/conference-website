// pages/api/admin/users/[userId]/profile.ts
//
// GET — identité d'un utilisateur cible, pour l'en-tête et les actions des
// vues d'inspection admin (`player-view`, `captain-view`).
//
// Remplace les deux endpoints-miroirs `player-view.ts` (518 l.) et
// `captain-view.ts` (395 l.), qui reproduisaient à la main les shapes de
// /api/player/* et divergeaient donc mécaniquement (S3 de
// docs/PLAN-espace-unifie.md). Les données d'espace joueur sont désormais lues
// par les VRAIS écrans via `?as=` ; il ne reste ici que ce qu'aucun endpoint
// joueur n'expose : les métadonnées du compte auth.
//
// Staff-gated (minRole 'admin'), scopé au tenant ACTIF du staff — même
// garantie que les endpoints remplacés : un admin ne lit rien hors du tenant
// dans lequel il agit. Audité une fois par requête.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';

import { logger } from '../../../../../utils/logger';

/** uuid v1-v5 (Supabase émet du v4, on reste tolérant). */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AdminUserProfileUser = {
  id: string;
  email: string | null;
  displayName: string | null;
  battleTag: string | null;
  avatarUrl: string | null;
  role: string | null;
  createdAt: string | null;
};

export type AdminUserProfilePayload = {
  user: AdminUserProfileUser;
  /**
   * Équipe de la cible dans le tenant actif, si elle en a une. Réduit au
   * strict nécessaire (badge d'en-tête + cible des actions transfert /
   * capitanat) : le détail du roster est rendu par les écrans joueur.
   */
  team: { id: string; name: string; role: string | null } | null;
};

export default withStaffRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AdminUserProfilePayload | { error: string }>,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 60, windowMs: 60_000 },
      'admin-user-profile'
    )
  ) {
    return;
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawUserId = req.query.userId;
  const userId = Array.isArray(rawUserId) ? rawUserId[0] : rawUserId;
  if (!userId || typeof userId !== 'string' || !UUID_RE.test(userId)) {
    return res.status(400).json({ error: 'Invalid userId' });
  }

  const tenantId = ctx.tenantId;

  const { data: authData, error: authErr } =
    await supabaseAdmin.auth.admin.getUserById(userId);
  if (authErr || !authData?.user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const targetUser = authData.user;
  const meta = (targetUser.user_metadata ?? {}) as Record<string, unknown>;

  const user: AdminUserProfileUser = {
    id: targetUser.id,
    email: (targetUser.email as string | null) ?? null,
    displayName:
      (meta.display_name as string | null) ??
      (meta.full_name as string | null) ??
      null,
    battleTag: (meta.battle_tag as string | null) ?? null,
    avatarUrl: (meta.avatar_url as string | null) ?? null,
    role: (meta.role as string | null) ?? null,
    createdAt: (targetUser.created_at as string | null) ?? null,
  };

  // Appartenance d'équipe dans le tenant du staff (une seule par tenant).
  let team: AdminUserProfilePayload['team'] = null;
  const { data: membership } = await supabaseAdmin
    .from('team_members')
    .select('team_id, role')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (membership?.team_id) {
    const { data: teamRow } = await supabaseAdmin
      .from('teams')
      .select('id, name')
      .eq('id', membership.team_id)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (teamRow) {
      team = {
        id: teamRow.id as string,
        name: teamRow.name as string,
        role: (membership.role as string | null) ?? null,
      };
    }
  }

  // Audit — ne jamais faire échouer la réponse sur un échec de journalisation.
  try {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'view_player_data',
      entity_type: 'user',
      entity_id: userId,
      tenant_id: tenantId,
      payload: {
        endpoint: '/api/admin/users/[userId]/profile',
        email: user.email,
      },
    });
  } catch (logErr) {
    logger.error('[admin/users/profile] audit log failed:', logErr);
  }

  res.setHeader('Cache-Control', 'private, no-store');
  return res.status(200).json({ user, team });
}, 'admin');
