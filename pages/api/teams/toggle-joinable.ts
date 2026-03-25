// pages/api/teams/toggle-joinable.ts
// POST : le capitaine active/desactive le recrutement ouvert de son equipe

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (applyRateLimit(req, res, { max: 10, windowMs: 60_000 }, 'toggle-joinable')) return;
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

  const userId = userData.user.id;

  // Check if user is captain of a team
  const { data: team, error: teamErr } = await supabaseAdmin
    .from('teams')
    .select('id, name, is_joinable')
    .eq('captain_id', userId)
    .eq('is_active', true)
    .maybeSingle();

  if (teamErr || !team) {
    return res.status(403).json({ error: 'Tu dois etre capitaine d\'une equipe active.' });
  }

  const { joinable } = req.body || {};
  const newValue = typeof joinable === 'boolean' ? joinable : !team.is_joinable;

  const { error: updateErr } = await supabaseAdmin
    .from('teams')
    .update({ is_joinable: newValue })
    .eq('id', team.id);

  if (updateErr) {
    console.error('[toggle-joinable] update error:', updateErr);
    return res.status(500).json({ error: 'Echec de la mise a jour.' });
  }

  return res.status(200).json({
    success: true,
    teamId: team.id,
    is_joinable: newValue,
    message: newValue
      ? 'Ton equipe est maintenant ouverte aux demandes de joueurs.'
      : 'Ton equipe est fermee aux nouvelles demandes.',
  });
}
