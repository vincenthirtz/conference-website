// GET /api/player/battlenet-status
//
// État de la vérification Battle.net pour le joueur connecté (Bearer, comme les
// autres endpoints /api/player/*). Sert à l'espace joueur pour afficher le
// badge « BattleTag vérifié » et proposer le bouton de vérification.
//
// Réponse : { configured, linked, battleTag, verifiedAt }
//   - configured : false si la feature est dormante (masque le bouton côté UI)
//   - linked     : un lien user_battlenet_links existe
//   - battleTag  : le BattleTag vérifié (ou null)
//   - verifiedAt : timestamp ISO de la dernière vérification (ou null)

import type { NextApiRequest, NextApiResponse } from 'next';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import { isBattlenetConfigured } from '@/utils/battlenet';
import { getBattlenetLinkStatus } from '@/utils/auth/battlenetLinks';

export default withAuthRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { user }
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (
    applyRateLimit(req, res, { max: 30, windowMs: 60_000 }, 'battlenet-status')
  )
    return;

  const status = await getBattlenetLinkStatus(user.id);

  return res.status(200).json({
    configured: isBattlenetConfigured(),
    linked: status.linked,
    battleTag: status.battleTag,
    verifiedAt: status.verifiedAt,
  });
});
