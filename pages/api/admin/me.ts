// pages/api/admin/me.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';

import { logger } from '../../../utils/logger';
type MeResponse =
  | {
      id: string;
      auth_user_id: string;
      email: string;
      display_name: string | null;
      avatar_url: string | null;
      role: string;
      created_at: string;
    }
  | { error: string };

export default withAuthRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse<MeResponse>,
  { user }
) {
  if (applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'admin-me'))
    return;
  // Prevent caching of sensitive staff data
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  const adminClient = supabaseAdmin;

  // Chercher l'entrée dans la table staff liée à cet utilisateur
  const selectWithAvatar =
    'id, auth_user_id, email, display_name, avatar_url, role, created_at';
  const selectWithoutAvatar =
    'id, auth_user_id, email, display_name, role, created_at';

  const fetchStaff = async (withAvatar = true) => {
    const columns = withAvatar ? selectWithAvatar : selectWithoutAvatar;
    return adminClient
      .from('staff')
      .select(columns)
      .eq('auth_user_id', user.id)
      .maybeSingle();
  };

  // PATCH → mise à jour du profil staff (display_name / avatar_url)
  if (req.method === 'PATCH') {
    const { displayName, avatarUrl } = req.body || {};
    const updatePayload: Record<string, any> = {};

    if (typeof displayName === 'string') {
      updatePayload.display_name = displayName.trim() || null;
    }
    if (typeof avatarUrl === 'string') {
      updatePayload.avatar_url = avatarUrl.trim() || null;
    }

    if (Object.keys(updatePayload).length === 0) {
      return res
        .status(400)
        .json({ error: 'No fields to update (displayName, avatarUrl).' });
    }

    const doUpdate = async (withAvatar = true) =>
      adminClient
        .from('staff')
        .update(
          withAvatar
            ? updatePayload
            : (() => {
                const { display_name } = updatePayload;
                return display_name !== undefined ? { display_name } : {};
              })()
        )
        .eq('auth_user_id', user.id)
        .select(withAvatar ? selectWithAvatar : selectWithoutAvatar)
        .maybeSingle();

    let { data: updated, error: updateError } = await doUpdate(true);

    // Si la colonne avatar_url n'existe pas (code 42703), on réessaie sans
    if (
      updateError &&
      typeof updateError === 'object' &&
      ((updateError as any).code === '42703' ||
        (updateError as any).code === 'PGRST204')
    ) {
      const retry = await doUpdate(false);
      updated = retry.data as any;
      updateError = retry.error;
    }

    if (updateError) {
      logger.error('[/api/admin/me] update error:', updateError);
      return res.status(500).json({ error: 'Failed to update the profile.' });
    }

    if (!updated) {
      return res.status(404).json({ error: 'Staff profile not found.' });
    }

    // Forcer avatar_url à null si absent du select
    if (!('avatar_url' in updated)) {
      (updated as any).avatar_url = null;
    }

    return res.status(200).json(updated as unknown as MeResponse);
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let { data: staff, error: staffError } = await fetchStaff(true);

  if (
    staffError &&
    typeof staffError === 'object' &&
    ((staffError as any).code === '42703' ||
      (staffError as any).code === 'PGRST204')
  ) {
    // Colonne avatar_url manquante → refetch sans
    const retry = await fetchStaff(false);
    staff = retry.data as any;
    staffError = retry.error;
  }

  if (staffError || !staff) {
    // Pas staff → vérifier si capitaine d'une équipe
    const { data: captainTeam } = await adminClient
      .from('teams')
      .select('id, name')
      .eq('captain_id', user.id)
      .limit(1)
      .maybeSingle();

    if (captainTeam) {
      return res.status(200).json({
        id: captainTeam.id,
        auth_user_id: user.id,
        email: user.email ?? '',
        display_name: user.user_metadata?.display_name ?? null,
        avatar_url: null,
        role: 'captain',
        created_at: user.created_at,
      } as unknown as MeResponse);
    }

    return res.status(403).json({ error: 'Not a staff member' });
  }

  if (!('avatar_url' in staff)) {
    (staff as any).avatar_url = null;
  }

  // OK : renvoyer les infos staff (c'est ce que tu consommeras côté front)
  return res.status(200).json(staff as unknown as MeResponse);
});
