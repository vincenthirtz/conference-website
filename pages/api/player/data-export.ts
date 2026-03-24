// pages/api/player/data-export.ts
// GET : exporte toutes les données personnelles de l'utilisateur (droit d'accès RGPD)

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (applyRateLimit(req, res, { max: 5, windowMs: 60_000 }, 'player-data-export')) return;

  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Service unavailable.' });
  }

  // Auth via Bearer token
  const authHeader = req.headers.authorization;
  const token =
    authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length)
      : undefined;

  if (!token) {
    return res.status(401).json({ error: 'Token required.' });
  }

  const { data: userData, error: userErr } =
    await supabaseAdmin.auth.getUser(token);

  if (userErr || !userData?.user) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }

  const user = userData.user;
  const userId = user.id;

  // Collect all user data in parallel
  const [
    teamMembership,
    demandes,
    staffEntry,
  ] = await Promise.all([
    // Team membership + team info
    supabaseAdmin
      .from('team_members')
      .select('id, role, joined_at, team:teams(id, name, short_name)')
      .eq('user_id', userId),

    // All demandes (requests)
    supabaseAdmin
      .from('demandes')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),

    // Staff entry if any
    supabaseAdmin
      .from('staff')
      .select('id, role, created_at')
      .eq('auth_user_id', userId)
      .maybeSingle(),
  ]);

  const exportData = {
    exported_at: new Date().toISOString(),
    account: {
      id: user.id,
      email: user.email,
      created_at: user.created_at,
      last_sign_in_at: user.last_sign_in_at,
      display_name: user.user_metadata?.display_name ?? null,
      battle_tag: user.user_metadata?.battle_tag ?? null,
      role: user.user_metadata?.role ?? null,
    },
    team_membership: teamMembership.data ?? [],
    demandes: demandes.data ?? [],
    staff: staffEntry.data ?? null,
  };

  res.setHeader('Content-Type', 'application/json');
  res.setHeader(
    'Content-Disposition',
    'attachment; filename="mes-donnees.json"'
  );
  return res.status(200).json(exportData);
}
