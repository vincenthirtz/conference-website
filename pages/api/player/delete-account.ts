// pages/api/player/delete-account.ts
// DELETE : l'utilisateur supprime définitivement son propre compte (droit à l'oubli RGPD)

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { sendAccountDeletedEmail } from '@/utils/email';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'DELETE') {
    res.setHeader('Allow', 'DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (applyRateLimit(req, res, { max: 3, windowMs: 60_000 }, 'player-delete-account')) return;

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

  // Owners cannot self-delete — too critical, must be removed by another owner
  const { data: staffEntry } = await supabaseAdmin
    .from('staff')
    .select('role')
    .eq('auth_user_id', userId)
    .maybeSingle();

  if (staffEntry?.role === 'owner') {
    return res.status(403).json({
      error:
        'Les comptes owner ne peuvent pas être auto-supprimés. Contacte un autre owner.',
    });
  }

  // Remove staff entry if exists (caster, manager, admin)
  if (staffEntry) {
    await supabaseAdmin
      .from('staff')
      .delete()
      .eq('auth_user_id', userId);
  }

  // Remove team memberships
  await supabaseAdmin
    .from('team_members')
    .delete()
    .eq('user_id', userId);

  // Remove demandes
  await supabaseAdmin
    .from('demandes')
    .delete()
    .eq('user_id', userId);

  // Send account deleted email (non-blocking)
  if (user.email) {
    sendAccountDeletedEmail(user.email).catch((err) => {
      console.error('[player/delete-account] email error:', err);
    });
  }

  // Delete auth user
  const { error: deleteErr } =
    await supabaseAdmin.auth.admin.deleteUser(userId);

  if (deleteErr) {
    console.error('[player/delete-account] delete error:', deleteErr);
    return res.status(500).json({ error: 'Erreur lors de la suppression du compte.' });
  }

  return res.status(200).json({ success: true });
}
