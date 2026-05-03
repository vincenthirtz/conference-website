import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';
import { applyRateLimit } from '@/utils/rateLimit';

import { logger } from '../../../../utils/logger';

type AvailableCaster = {
  authUserId: string;
  displayName: string | null;
  email: string;
  avatarUrl: string | null;
  linkedCastMemberId: string | null;
};

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 60, windowMs: 60_000 },
      'admin-available-casters'
    )
  )
    return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }
  const admin = supabaseAdmin;

  const { data: casters, error: staffErr } = await admin
    .from('staff')
    .select('auth_user_id, display_name, email, avatar_url')
    .eq('role', 'caster');

  if (staffErr) {
    logger.error('[admin/available-casters] staff list error', staffErr);
    return res.status(500).json({ error: 'Failed to load staff.' });
  }

  const userIds = (casters ?? []).map((c) => c.auth_user_id);
  let linkedMap = new Map<string, string>();

  if (userIds.length > 0) {
    const { data: links, error: linksErr } = await admin
      .from('cast_members')
      .select('id, auth_user_id')
      .in('auth_user_id', userIds);

    if (linksErr) {
      logger.error('[admin/available-casters] links error', linksErr);
      return res.status(500).json({ error: 'Failed to load existing links.' });
    }

    linkedMap = new Map(
      (links ?? [])
        .filter((l) => l.auth_user_id)
        .map((l) => [l.auth_user_id as string, l.id])
    );
  }

  const items: AvailableCaster[] = (casters ?? []).map((c) => ({
    authUserId: c.auth_user_id,
    displayName: c.display_name,
    email: c.email,
    avatarUrl: c.avatar_url,
    linkedCastMemberId: linkedMap.get(c.auth_user_id) ?? null,
  }));

  return res.status(200).json({ items });
}

export default withStaffRoute(handler, 'admin');
