// pages/api/admin/me.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import {
  resolveActiveTenant,
  readActiveTenantCookie,
} from '@/utils/adminTenants';
import { getTenantKind, type TenantKind } from '@/utils/tenantKind';

const patchProfileSchema = z.object({
  displayName: z.string().trim().max(80).optional(),
  avatarUrl: z.string().url().max(2048).nullable().optional(),
});

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
      active_tenant_kind: TenantKind;
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
    const parsed = patchProfileSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error:
          'Champs invalides : displayName (texte, 80 max), avatarUrl (URL valide, 2048 max).',
      });
    }

    const { displayName, avatarUrl } = parsed.data;
    const updatePayload: Record<string, any> = {};

    if (displayName !== undefined) {
      updatePayload.display_name = displayName.trim() || null;
    }
    if (avatarUrl !== undefined) {
      updatePayload.avatar_url = avatarUrl ? avatarUrl.trim() : null;
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
        active_tenant_kind: 'organizer',
      } as unknown as MeResponse);
    }

    return res.status(403).json({ error: 'Not a staff member' });
  }

  if (!('avatar_url' in staff)) {
    (staff as any).avatar_url = null;
  }

  // Résolution du tenant actif → nature (organizer/developer) pour permettre
  // au front de masquer/adapter l'UI d'un compte développeur. Fail-safe :
  // toute erreur retombe sur 'organizer' (ne casse jamais /me).
  const staffRow = staff as unknown as {
    id: string;
    is_pole_admin?: boolean;
  } & Record<string, unknown>;

  let active_tenant_kind: TenantKind = 'organizer';
  try {
    const cookieTenantId = readActiveTenantCookie(req.cookies);
    const { tenantId } = await resolveActiveTenant(
      staffRow.id,
      cookieTenantId,
      { isPoleAdmin: staffRow.is_pole_admin === true }
    );
    active_tenant_kind = await getTenantKind(tenantId);
  } catch (e) {
    logger.error('[/api/admin/me] active_tenant_kind resolution error:', e);
  }

  // OK : renvoyer les infos staff (c'est ce que tu consommeras côté front)
  return res
    .status(200)
    .json({ ...staffRow, active_tenant_kind } as unknown as MeResponse);
});
