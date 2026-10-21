// features/player/tcg/ui/useTcgCardLabels.ts — libellés traduits passés à
// `TcgCard` et à la révélation (les deux affichent le crédit, ou aucune).

import { useMemo } from 'react';
import { useT } from '@/lib/i18n/useT';
import nsPlayerTcg from '@/lib/i18n/locales/fr/playerTcg';
import type { TcgRarity } from '@/utils/tcg/rarity';
import { tcgCardStatsLabels } from '@/components/tcg/tcgCardStatsLabels';

export function useTcgCardLabels() {
  const t = useT(nsPlayerTcg);
  return useMemo(
    () => ({
      rarity: {
        common: t.rarityCommon,
        rare: t.rarityRare,
        epic: t.rarityEpic,
        legendary: t.rarityLegendary,
      } as Record<TcgRarity, string>,
      foil: t.foil,
      copies: t.copies,
      logoCredit: t.logoCredit,
      associationCredit: t.associationCredit,
      association: t.cardAssociation,
      alternateArt: t.cardAlternateArt,
      // Sous la figurine d'une joueuse sans photo : son rôle.
      roles: {
        tank: t.roleTank,
        damage: t.roleDamage,
        support: t.roleSupport,
      },
      // Niveau, attaque, défense (lot 11) : la ligne sous la rareté.
      stats: tcgCardStatsLabels(t),
    }),
    [t]
  );
}

export type TcgCardLabels = ReturnType<typeof useTcgCardLabels>;
