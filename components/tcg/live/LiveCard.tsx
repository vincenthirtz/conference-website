// components/tcg/live/LiveCard.tsx
//
// Une carte des blocs « TCG en action » : `TcgCard` nourri d'une
// `ShowcaseCard` (la forme que rendent la vitrine et `utils/tcg/live.ts`),
// libellés du namespace du TCG. Un seul endroit pour ce câblage, partagé par
// les tirages, la carte de la semaine et les vitrines d'équipe.

import type { JSX } from 'react';
import TcgCard from '@/components/tcg/TcgCard';
import { showcaseCardSubject } from '@/components/tcg/TcgShowcaseSection';
import type { ShowcaseCard } from '@/utils/tcg/showcase';
import { useT } from '@/lib/i18n/useT';
import nsPlayerTcg from '@/lib/i18n/locales/fr/playerTcg';

export default function LiveCard({
  card,
}: {
  card: ShowcaseCard;
}): JSX.Element {
  const tTcg = useT(nsPlayerTcg);
  return (
    <TcgCard
      subject={showcaseCardSubject(card)}
      rarity={card.rarity}
      isFoil={card.isFoil}
      labels={{
        rarity: {
          common: tTcg.rarityCommon,
          rare: tTcg.rarityRare,
          epic: tTcg.rarityEpic,
          legendary: tTcg.rarityLegendary,
        },
        foil: tTcg.foil,
        copies: tTcg.copies,
        logoCredit: tTcg.logoCredit,
        associationCredit: tTcg.associationCredit,
        association: tTcg.cardAssociation,
        alternateArt: tTcg.cardAlternateArt,
      }}
    />
  );
}
