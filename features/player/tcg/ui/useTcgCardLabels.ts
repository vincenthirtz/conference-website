// features/player/tcg/ui/useTcgCardLabels.ts — libellés traduits passés à
// `TcgCard` et à la révélation (les deux affichent le crédit, ou aucune).

import { useMemo } from 'react';
import { useT } from '@/lib/i18n/useT';
import nsPlayerTcg from '@/lib/i18n/locales/fr/playerTcg';
import type { TcgRarity } from '@/utils/tcg/rarity';

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
      association: t.cardAssociation,
      // Sous la figurine d'une joueuse sans photo : son rôle.
      roles: {
        tank: t.roleTank,
        damage: t.roleDamage,
        support: t.roleSupport,
      },
    }),
    [t]
  );
}

export type TcgCardLabels = ReturnType<typeof useTcgCardLabels>;
