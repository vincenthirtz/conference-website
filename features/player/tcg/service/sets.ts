// features/player/tcg/service/sets.ts — la progression des séries
// (lot P14, extrait de pages/api/player/tcg/sets.ts, même contrat).
//
// UNE LECTURE QUI PEUT ÉCRIRE, ET C'EST VOULU : `checkCollectionSets`
// récompense les séries complètes pas encore payées (rattrapage). L'écriture
// est idempotente PAR SA CLÉ EN BASE (registre à clé unique) — un GET rejoué ne
// crédite qu'une fois. Rien de cette protection ne vit ici.
//
// D'où `subject: 'self'` sur la route : une inspection staff ne doit pas
// déclencher de récompense au nom de quelqu'un.

import { LegacyAdminError } from '@/utils/admin/errors';
import { checkCollectionSets } from '@/utils/tcg/grantCollectionSets';
import type { TcgServiceContext } from './context';

export async function readCollectionSets(
  ctx: Pick<TcgServiceContext, 'tenantId' | 'userId'>
) {
  const result = await checkCollectionSets({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
  });
  if (!result.ok) {
    throw new LegacyAdminError(500, 'Lecture impossible.', {
      code: 'sets_unreadable',
    });
  }
  return {
    sets: result.sets,
    rewardCoins: result.rewardCoins,
    newlyRewarded: result.newlyRewarded,
  };
}
