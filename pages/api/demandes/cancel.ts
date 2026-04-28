// pages/api/demandes/cancel.ts
// DELETE : l'utilisateur annule sa propre demande pending (join ou captain_request)

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

  if (
    applyRateLimit(req, res, { max: 10, windowMs: 60_000 }, 'demandes-cancel')
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
  const { demandeId } = req.body || {};

  if (!demandeId || typeof demandeId !== 'string' || !isValidUUID(demandeId)) {
    return res.status(400).json({ error: 'demandeId (UUID) requis.' });
  }

  // Vérifier que la demande appartient à l'utilisateur et est pending
  const { data: demande, error: fetchErr } = await supabaseAdmin
    .from('demandes')
    .select('id, user_id, status')
    .eq('id', demandeId)
    .maybeSingle();

  if (fetchErr || !demande) {
    return res.status(404).json({ error: 'Demande introuvable.' });
  }

  if (demande.user_id !== userId) {
    return res
      .status(403)
      .json({ error: "Cette demande ne t'appartient pas." });
  }

  if (demande.status !== 'pending') {
    return res.status(400).json({
      error: `Impossible d'annuler une demande au statut "${demande.status}".`,
    });
  }

  // Mettre à jour le statut en "cancelled"
  const { error: updateErr } = await supabaseAdmin
    .from('demandes')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', demandeId);

  if (updateErr) {
    console.error('[demandes/cancel] update error:', updateErr);
    return res.status(500).json({ error: "Échec de l'annulation." });
  }

  return res.status(200).json({
    success: true,
    info: 'Demande annulée.',
  });
}
