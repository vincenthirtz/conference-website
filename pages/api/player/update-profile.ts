// pages/api/player/update-profile.ts
// PATCH : mise a jour du display_name, du battle_tag et du niveau Overwatch
// declare dans user_metadata, avec propagation sur les fiches de roster.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import { resolveTenantIdForUserRequest } from '@/utils/tenant';
import {
  SKILL_RATING_MAX,
  SKILL_RATING_MIN,
  isValidSkillRating,
} from '@/utils/overwatchRank';

import { logger } from '../../../utils/logger';
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

  const { display_name, battle_tag, avatar_url, skill_rating } = req.body || {};
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

  // Niveau Overwatch. Une joueuse doit pouvoir annoncer le sien sans dependre
  // de sa capitaine : c'est SA donnee, et la faire transiter par quelqu'un
  // d'autre pour une valeur qu'elle seule connait n'avait pas de sens.
  // `null` / chaine vide effacent ; l'absence de cle ne touche a rien.
  if ('skill_rating' in (req.body || {})) {
    if (
      skill_rating === null ||
      (typeof skill_rating === 'string' && skill_rating.trim() === '')
    ) {
      updates.skill_rating = null;
    } else {
      const parsed =
        typeof skill_rating === 'string'
          ? Number(skill_rating.trim())
          : skill_rating;
      if (!isValidSkillRating(parsed)) {
        return res.status(400).json({
          error: `Le SR doit etre un entier entre ${SKILL_RATING_MIN} et ${SKILL_RATING_MAX}.`,
          code: 'SKILL_RATING_INVALID',
        });
      }
      updates.skill_rating = parsed;
    }
  }

  if (typeof avatar_url === 'string') {
    const trimmed = avatar_url.trim();
    if (
      trimmed &&
      (!(trimmed.startsWith('http://') || trimmed.startsWith('https://')) ||
        trimmed.length > 2048)
    ) {
      return res.status(400).json({ error: "URL d'avatar invalide." });
    }
    updates.avatar_url = trimmed || null;
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
    logger.error('[player/update-profile] error:', updateErr);
    return res.status(500).json({ error: 'Echec de la mise a jour.' });
  }

  // Si battle_tag modifie, mettre a jour aussi team_members (scoped au tenant
  // courant — un user pourrait theoriquement avoir un BT different par tenant
  // a terme ; pour l'instant on update juste celui du tenant courant).
  const rosterUpdates: Record<string, unknown> = {};
  if ('battle_tag' in updates) rosterUpdates.battle_tag = updates.battle_tag;
  // Le SR suit le meme chemin que le BattleTag : il vit sur la FICHE de roster,
  // c'est elle qui alimente la moyenne d'equipe et l'annuaire des adversaires.
  // Le garder seulement dans les metadonnees du compte le rendrait invisible.
  if ('skill_rating' in updates)
    rosterUpdates.skill_rating = updates.skill_rating;

  if (Object.keys(rosterUpdates).length > 0) {
    const tenantId = resolveTenantIdForUserRequest(req, {
      authUserId: user.id,
    });
    await supabaseAdmin
      .from('team_members')
      .update(rosterUpdates)
      .eq('user_id', user.id)
      .eq('tenant_id', tenantId);
  }

  return res.status(200).json({
    success: true,
    ...updates,
  });
});
