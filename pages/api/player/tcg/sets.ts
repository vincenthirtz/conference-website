// pages/api/player/tcg/sets.ts
//
//   GET → la progression de mes séries (collections à compléter).
//
// UNE LECTURE QUI PEUT ÉCRIRE, ET C'EST VOULU. Chaque appel vérifie les séries
// complètes et récompense celles qui ne l'ont pas encore été
// (`checkCollectionSets`) : c'est le RATTRAPAGE des séries déjà complètes
// avant la fonctionnalité, d'une migration appliquée après coup, ou d'une
// ouverture de paquet dont l'effet de bord a échoué. L'écriture est
// idempotente par sa clé — un rechargement, deux onglets, une ouverture
// simultanée ne créditent qu'une fois — donc un GET rejoué ne coûte rien.
//
// PAS DE `?as=` (withAuthRoute, pas withSubjectRoute) : une vue d'inspection
// staff ne doit pas déclencher de récompense au nom de quelqu'un.
//
// ON NE NOMME PAS LES JOUEUSES MANQUANTES : `missingNamed` ne porte que des
// équipes et des maps, `missingPlayers` est un nombre. Cf.
// `utils/tcg/collectionSets.ts`.

import type { NextApiRequest, NextApiResponse } from 'next';

import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import { resolveTenantIdForUserRequest } from '@/utils/tenant';
import { checkCollectionSets } from '@/utils/tcg/grantCollectionSets';

export default withAuthRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { user }
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  // Plus bas que la collection (60/min) : chaque lecture peut écrire.
  if (
    applyRateLimit(req, res, { max: 30, windowMs: 60_000 }, 'player-tcg-sets')
  ) {
    return;
  }

  // Personnel, et peut changer à chaque ouverture de paquet.
  res.setHeader('Cache-Control', 'private, no-store');

  const tenantId = resolveTenantIdForUserRequest(req);
  const result = await checkCollectionSets({ tenantId, userId: user.id });
  if (!result.ok) {
    // Une progression illisible n'est pas « aucune série » : l'écran le dit.
    return res
      .status(500)
      .json({ error: 'Lecture impossible.', code: 'sets_unreadable' });
  }

  return res.status(200).json({
    sets: result.sets,
    rewardCoins: result.rewardCoins,
    newlyRewarded: result.newlyRewarded,
  });
});
