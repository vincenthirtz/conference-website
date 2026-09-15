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
//   - reward     : { coins, claimable } | null — la récompense TCG de la
//                  vérification (ajout additif, 2026-09-15). `coins` vient du
//                  registre `earnSources.ts` : la carte l'annonce sans jamais
//                  écrire un nombre. `null` = récompense non activée.
//                  `claimable: false` = déjà reçue, ou registre illisible.

import type { NextApiRequest, NextApiResponse } from 'next';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import { isBattlenetConfigured } from '@/utils/battlenet';
import { getBattlenetLinkStatus } from '@/utils/auth/battlenetLinks';
import { readBattlenetRewardOffer } from '@/utils/tcg/grantBattlenetVerified';

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

  const [status, reward] = await Promise.all([
    getBattlenetLinkStatus(user.id),
    readBattlenetRewardOffer(user.id),
  ]);

  return res.status(200).json({
    configured: isBattlenetConfigured(),
    linked: status.linked,
    battleTag: status.battleTag,
    verifiedAt: status.verifiedAt,
    reward,
  });
});
