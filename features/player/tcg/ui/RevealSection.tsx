// features/player/tcg/ui/RevealSection.tsx — le tirage qu'on vient d'ouvrir.
// « Nouvelle carte ou doublon ? » vient du SERVEUR (`isNew`) : la collection
// chargée est paginée, elle ne peut pas le dire. `isNew` absent ⇒ on ne dit
// rien plutôt qu'un faux « nouvelle ».

import { format, useT } from '@/lib/i18n/useT';
import nsPlayerTcg from '@/lib/i18n/locales/fr/playerTcg';
import type { TcgRevealCard } from '@/components/tcg/TcgPackReveal';
import { cardSubject, type DrawnCard } from '../model';
import type { TcgCardLabels } from './useTcgCardLabels';
import { TcgPackReveal } from './lazyPanels';

export default function RevealSection({
  revealed,
  recycleRefund,
  labels,
  onDismiss,
}: {
  revealed: { id: string; cards: DrawnCard[] };
  recycleRefund: number | null;
  labels: TcgCardLabels;
  onDismiss: () => void;
}) {
  const t = useT(nsPlayerTcg);
  const cards: TcgRevealCard[] = revealed.cards.map((c) => ({
    key: String(c.position),
    subject: cardSubject(c),
    rarity: c.rarity,
    isFoil: c.isFoil,
    isNew: typeof c.isNew === 'boolean' ? c.isNew : null,
  }));
  const knownNew = cards.filter((c) => c.isNew !== null);
  const fresh = knownNew.filter((c) => c.isNew === true).length;
  const summary =
    knownNew.length === 0
      ? null
      : fresh === 0
        ? t.revealSummary_none
        : fresh === 1
          ? format(t.revealSummary_one, { count: cards.length })
          : format(t.revealSummary_other, { fresh, count: cards.length });

  return (
    // `key` = le paquet : ouvrir un second paquet REJOUE l'apparition.
    <TcgPackReveal
      key={revealed.id}
      cards={cards}
      onDismiss={onDismiss}
      labels={{
        title: t.revealTitle,
        subtitle: t.revealSubtitle,
        summary,
        duplicateHint:
          recycleRefund !== null
            ? format(t.revealDuplicateHint, { refund: recycleRefund })
            : null,
        dismiss: t.revealDismiss,
        revealAll: t.revealAll,
        newCard: t.revealNewCard,
        duplicate: t.revealDuplicate,
        card: labels,
      }}
    />
  );
}
