// features/player/library/ui/arena/ArenaCardFace.tsx — une carte de l'arène :
// la `TcgCard` de la collection (lot 11 : niveau, ATK, DEF), avec SES
// chiffres figés au lancement du duel, et sa face relue par le serveur (une
// joueuse retirée du TCG y est anonyme).
//
// Toujours SANS lien (`noLink`, `insideInteractive`) : sur le plateau, la
// carte est dans un bouton (choisir, cibler) — un lien dans un bouton serait
// invalide, et ouvrir la fiche d'une joueuse au milieu d'un duel n'a pas de
// sens.

import { useMemo } from 'react';
import TcgCard from '@/components/tcg/TcgCard';
import { tcgCardStatsLabels } from '@/components/tcg/tcgCardStatsLabels';
import { useT } from '@/lib/i18n/useT';
import nsPlayerTcg from '@/lib/i18n/locales/fr/playerTcg';
import type { TcgRarity } from '@/utils/tcg/rarity';
import type { ArenaFace } from '../../arena/responses';
import type { ArenaCardInput } from '../../arena/rules';
import { faceSubject, statsOf } from '../../arena/viewModel';

/** Les libellés de `TcgCard`, traduits une fois par écran. */
export function useArenaCardLabels() {
  const t = useT(nsPlayerTcg);
  return useMemo(() => {
    const rarity: Record<TcgRarity, string> = {
      common: t.rarityCommon,
      rare: t.rarityRare,
      epic: t.rarityEpic,
      legendary: t.rarityLegendary,
    };
    return {
      rarity,
      foil: t.foil,
      copies: t.copies,
      logoCredit: t.logoCredit,
      associationCredit: t.associationCredit,
      association: t.cardAssociation,
      alternateArt: t.cardAlternateArt,
      roles: { tank: t.roleTank, damage: t.roleDamage, support: t.roleSupport },
      stats: tcgCardStatsLabels(t),
    };
  }, [t]);
}

export type ArenaCardLabels = ReturnType<typeof useArenaCardLabels>;

/** Le nom d'un profil (« Assaut », « Rempart », « Équilibre »). */
export function useProfileNames() {
  const t = useT(nsPlayerTcg);
  return useMemo(
    () => ({
      assault: t.statsProfileAssault,
      bulwark: t.statsProfileBulwark,
      balanced: t.statsProfileBalanced,
    }),
    [t]
  );
}

export default function ArenaCardFace({
  card,
  face,
  labels,
  className = '',
}: {
  card: ArenaCardInput;
  face: ArenaFace | undefined;
  labels: ArenaCardLabels;
  className?: string;
}) {
  return (
    <div className={`arena-card ${className}`} data-arena-card={card.key}>
      <TcgCard
        subject={faceSubject(face, card.key)}
        rarity={card.rarity}
        isFoil={card.foil}
        stats={statsOf(card)}
        noLink
        insideInteractive
        labels={labels}
      />
    </div>
  );
}
