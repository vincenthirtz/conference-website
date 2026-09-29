// features/player/tcg/ui/CollectionCardDetail.tsx — la fiche plein écran
// d'une carte de la collection (archétype COLLECTION) : la carte, avec son
// lien vers le sujet, et le recyclage d'un doublon.
//
// Le recyclage n'apparaît QUE sur un vrai doublon : l'API ne rend
// `recyclable` qu'à partir de deux exemplaires (la route refuserait le
// dernier), et le montant est celui rendu par l'API (`null` ⇒ pas de bouton).

import TcgCard from '@/components/tcg/TcgCard';
import { Button } from '@/features/ruban';
import { format, useT } from '@/lib/i18n/useT';
import nsPlayerTcg from '@/lib/i18n/locales/fr/playerTcg';
import { cardName, cardSubject, type CollectionCard } from '../model';
import type { TcgCardLabels } from './useTcgCardLabels';

export default function CollectionCardDetail({
  card,
  labels,
  recycleRefund,
  busy,
  onRecycle,
}: {
  card: CollectionCard;
  labels: TcgCardLabels;
  recycleRefund: number | null;
  busy: string | null;
  onRecycle: (card: CollectionCard) => void;
}) {
  const t = useT(nsPlayerTcg);
  const target = card.recyclable ?? null;
  const recycleKey = target
    ? `recycle:${target.packId}:${target.position}`
    : null;
  return (
    <div className="flex flex-col gap-4">
      <TcgCard
        subject={cardSubject(card)}
        rarity={card.rarity}
        isFoil={card.isFoil}
        count={card.count}
        labels={labels}
      />
      {target && recycleRefund !== null && (
        <Button
          variant="ghost"
          className="w-full"
          onClick={() => onRecycle(card)}
          disabled={busy !== null}
          aria-busy={busy === recycleKey}
          // Le nom accessible dit DE QUELLE carte il s'agit.
          aria-label={format(t.recycleAria, {
            name: cardName(card) ?? t.revealUnnamed,
            refund: recycleRefund,
          })}
        >
          {busy === recycleKey
            ? t.recycling
            : format(t.recycleAction, { refund: recycleRefund })}
        </Button>
      )}
    </div>
  );
}

/** La vignette : la même carte, SANS lien (elle est déjà dans un bouton). */
export function CollectionCardTile({
  card,
  labels,
}: {
  card: CollectionCard;
  labels: TcgCardLabels;
}) {
  return (
    <TcgCard
      subject={cardSubject(card)}
      rarity={card.rarity}
      isFoil={card.isFoil}
      count={card.count}
      labels={labels}
      noLink
      insideInteractive
    />
  );
}
