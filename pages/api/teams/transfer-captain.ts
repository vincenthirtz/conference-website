// pages/api/teams/transfer-captain.ts
// PATCH : le capitaine transfère son rôle à un autre membre de l'équipe

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { isValidUUID } from '@/utils/apiHelpers';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (
    applyRateLimit(
      req,
      res,
      { max: 10, windowMs: 60_000 },
      'teams-transfer-captain'
    )
  )
    return;
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
  const { newCaptainUserId } = req.body || {};

  if (
    !newCaptainUserId ||
    typeof newCaptainUserId !== 'string' ||
    !isValidUUID(newCaptainUserId)
  ) {
    return res.status(400).json({ error: 'newCaptainUserId (UUID) requis.' });
  }

  if (newCaptainUserId === userId) {
    return res.status(400).json({ error: 'Tu es déjà capitaine.' });
  }

  // Trouver l'équipe dont l'utilisateur est capitaine
  const { data: team, error: teamErr } = await supabaseAdmin
    .from('teams')
    .select('id, captain_id')
    .eq('captain_id', userId)
    .maybeSingle();

  if (teamErr) {
    console.error('[transfer-captain] team lookup error:', teamErr);
    return res.status(500).json({ error: 'Failed to find your team.' });
  }

  if (!team) {
    return res
      .status(403)
      .json({ error: "Tu n'es capitaine d'aucune équipe." });
  }

  // Vérifier que le nouveau capitaine est bien membre de l'équipe
  const { data: newCaptainMembership } = await supabaseAdmin
    .from('team_members')
    .select('id')
    .eq('team_id', team.id)
    .eq('user_id', newCaptainUserId)
    .maybeSingle();

  if (!newCaptainMembership) {
    return res.status(400).json({
      error: "Ce joueur n'est pas membre de ton équipe.",
    });
  }

  // Transférer
  const { error: updateErr } = await supabaseAdmin
    .from('teams')
    .update({
      captain_id: newCaptainUserId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', team.id);

  if (updateErr) {
    console.error('[transfer-captain] update error:', updateErr);
    return res.status(500).json({ error: 'Failed to transfer captaincy.' });
  }

  return res.status(200).json({
    success: true,
    info: 'Capitanat transféré avec succès.',
    newCaptainUserId,
  });
}
