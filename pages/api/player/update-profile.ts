// pages/api/player/update-profile.ts
// PATCH : mise a jour du display_name et/ou battle_tag dans user_metadata

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';

const BATTLE_TAG_RE = /^[A-Za-z0-9\u00C0-\u024F]+#[0-9]{4,6}$/;

export default withAuthRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { user }
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
      'player-update-profile'
    )
  )
    return;

  const { display_name, battle_tag } = req.body || {};
  const updates: Record<string, unknown> = {};

  if (typeof display_name === 'string') {
    const trimmed = display_name.trim();
    if (trimmed.length > 50) {
      return res
        .status(400)
        .json({ error: 'Le nom affiche ne peut pas depasser 50 caracteres.' });
    }
    updates.display_name = trimmed || null;
  }

  if (typeof battle_tag === 'string') {
    const trimmed = battle_tag.trim();
    if (trimmed && !BATTLE_TAG_RE.test(trimmed)) {
      return res
        .status(400)
        .json({ error: 'Format BattleTag invalide (ex: Pseudo#1234).' });
    }
    updates.battle_tag = trimmed || null;
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'Aucun champ a mettre a jour.' });
  }

  const existingMeta = user.user_metadata ?? {};
  const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(
    user.id,
    {
      user_metadata: { ...existingMeta, ...updates },
    }
  );

  if (updateErr) {
    console.error('[player/update-profile] error:', updateErr);
    return res.status(500).json({ error: 'Echec de la mise a jour.' });
  }

  // Si battle_tag modifie, mettre a jour aussi team_members
  if ('battle_tag' in updates) {
    await supabaseAdmin
      .from('team_members')
      .update({ battle_tag: updates.battle_tag })
      .eq('user_id', user.id);
  }

  return res.status(200).json({
    success: true,
    ...updates,
  });
});
