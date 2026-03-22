// pages/api/teams/[teamId]/members.ts
// DELETE : le capitaine retire un membre de son équipe (route publique, auth Bearer)

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { isValidUUID } from '@/utils/apiHelpers';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'DELETE') {
    res.setHeader('Allow', 'DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (applyRateLimit(req, res, { max: 10, windowMs: 60_000 }, 'teams-remove-member')) return;
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Service unavailable.' });
  }

  const { id: teamId } = req.query;
  if (!teamId || Array.isArray(teamId) || !isValidUUID(teamId)) {
    return res.status(400).json({ error: 'Invalid teamId' });
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

  // Vérifier que l'utilisateur est capitaine de cette équipe
  const { data: team } = await supabaseAdmin
    .from('teams')
    .select('id, captain_id')
    .eq('id', teamId)
    .maybeSingle();

  if (!team) {
    return res.status(404).json({ error: 'Équipe introuvable.' });
  }

  if (team.captain_id !== userId) {
    return res.status(403).json({
      error: 'Seul le capitaine peut retirer des membres.',
    });
  }

  const { memberId } = req.body || {};
  if (!memberId || typeof memberId !== 'string' || !isValidUUID(memberId)) {
    return res.status(400).json({ error: 'memberId (UUID) requis.' });
  }

  // Récupérer le membre
  const { data: member, error: fetchErr } = await supabaseAdmin
    .from('team_members')
    .select('id, user_id')
    .eq('id', memberId)
    .eq('team_id', teamId)
    .maybeSingle();

  if (fetchErr || !member) {
    return res.status(404).json({ error: 'Membre introuvable dans cette équipe.' });
  }

  // Empêcher le capitaine de se retirer lui-même via cet endpoint
  if (member.user_id === userId) {
    return res.status(400).json({
      error: 'Le capitaine ne peut pas se retirer. Transfère le capitanat d\'abord.',
    });
  }

  const { error: deleteErr } = await supabaseAdmin
    .from('team_members')
    .delete()
    .eq('id', memberId)
    .eq('team_id', teamId);

  if (deleteErr) {
    console.error('[teams/[teamId]/members] delete error:', deleteErr);
    return res.status(500).json({ error: 'Échec de la suppression du membre.' });
  }

  return res.status(200).json({
    success: true,
    info: 'Membre retiré de l\'équipe.',
  });
}
