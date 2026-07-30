// pages/api/demandes/cancel.ts
// DELETE : l'utilisateur annule sa propre demande pending (join ou captain_request)

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { isValidUUID } from '@/utils/apiHelpers';
import { withAuthRoute } from '@/utils/staff';
import { resolveTenantIdForUserRequestAsync } from '@/utils/tenant';

import { logger } from '../../../utils/logger';
export default withAuthRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { user }
) {
  if (req.method !== 'DELETE') {
    res.setHeader('Allow', 'DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (
    applyRateLimit(req, res, { max: 10, windowMs: 60_000 }, 'demandes-cancel')
  )
    return;

  const userId = user.id;
  const tenantId = await resolveTenantIdForUserRequestAsync(req, {
    authUserId: userId,
  });
  const { demandeId } = req.body || {};

  if (!demandeId || typeof demandeId !== 'string' || !isValidUUID(demandeId)) {
    return res.status(400).json({ error: 'demandeId (UUID) requis.' });
  }

  // Vérifier l'ownership (403 explicite si la demande existe mais appartient à
  // un autre user). Lecture ciblée : on ne s'appuie PAS sur le statut lu ici
  // pour décider (TOCTOU) — le CAS ci-dessous est la seule source de vérité.
  const { data: demande, error: fetchErr } = await supabaseAdmin
    .from('demandes')
    .select('id, user_id')
    .eq('id', demandeId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (fetchErr || !demande) {
    return res.status(404).json({ error: 'Demande introuvable.' });
  }

  if (demande.user_id !== userId) {
    return res
      .status(403)
      .json({ error: "Cette demande ne t'appartient pas." });
  }

  // Annulation atomique : UPDATE conditionné par status='pending' + retour des
  // lignes affectées. Si 0 ligne → la demande n'était plus pending (déjà
  // traitée / annulée entre-temps) → 409. Élimine la fenêtre TOCTOU entre le
  // check pending et l'update.
  const { data: updated, error: updateErr } = await supabaseAdmin
    .from('demandes')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', demandeId)
    .eq('tenant_id', tenantId)
    .eq('status', 'pending')
    .select('id');

  if (updateErr) {
    logger.error('[demandes/cancel] update error:', updateErr);
    return res.status(500).json({ error: "Échec de l'annulation." });
  }

  if (!updated || updated.length === 0) {
    return res.status(409).json({
      error: 'Cette demande a déjà été traitée.',
    });
  }

  return res.status(200).json({
    success: true,
    info: 'Demande annulée.',
  });
});
