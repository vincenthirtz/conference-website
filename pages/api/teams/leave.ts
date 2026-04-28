// pages/api/teams/leave.ts
// POST : l'utilisateur authentifié quitte son équipe
// Le capitaine doit d'abord transférer son rôle via PATCH /api/teams/transfer-captain

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { isTeamRosterLocked, rosterLockErrorMessage } from '@/utils/teams/rosterLock';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (applyRateLimit(req, res, { max: 10, windowMs: 60_000 }, 'teams-leave')) return;
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

  // Trouver le membership
  const { data: membership, error: membershipErr } = await supabaseAdmin
    .from('team_members')
    .select('id, team_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (membershipErr) {
    console.error('[teams/leave] membership error:', membershipErr);
    return res.status(500).json({ error: 'Failed to check membership.' });
  }

  if (!membership) {
    return res.status(400).json({ error: "Tu n'es membre d'aucune équipe." });
  }

  // Vérifier si l'utilisateur est capitaine
  const { data: team } = await supabaseAdmin
    .from('teams')
    .select('captain_id')
    .eq('id', membership.team_id)
    .maybeSingle();

  if (team?.captain_id === userId) {
    return res.status(403).json({
      error:
        'Le capitaine ne peut pas quitter l\'équipe. Transfère le rôle de capitaine à un autre membre d\'abord.',
    });
  }

  // Garde roster lock : un membre ne peut pas non plus quitter une equipe avec
  // roster verrouille. L'admin peut forcer via l'API admin.
  const lockStatus = await isTeamRosterLocked(membership.team_id);
  if (lockStatus.locked) {
    return res.status(409).json({
      error: rosterLockErrorMessage(lockStatus),
    });
  }

  // Supprimer le membership
  const { error: deleteErr } = await supabaseAdmin
    .from('team_members')
    .delete()
    .eq('id', membership.id);

  if (deleteErr) {
    console.error('[teams/leave] delete error:', deleteErr);
    return res.status(500).json({ error: 'Failed to leave team.' });
  }

  return res.status(200).json({
    success: true,
    info: "Tu as quitté l'équipe.",
  });
}
