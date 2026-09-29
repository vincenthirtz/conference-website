// features/player/tcg/ui/RecycleConfirmBody.tsx — ce que la confirmation de
// recyclage chiffre AVANT le geste : le gain, le solde avant → après, ce qu'il
// restera, et les échanges en attente (on AVERTIT, on n'interdit pas).
//
// Les montants viennent de l'API : c'est la base qui crédite, une seule fois.

import { TcgAmount } from '@/components/tcg/TcgCoin';
import { format, useT } from '@/lib/i18n/useT';
import nsPlayerTcg from '@/lib/i18n/locales/fr/playerTcg';
import type { CollectionCard } from '../model';

export default function RecycleConfirmBody({
  card,
  refund,
  balance,
}: {
  card: CollectionCard;
  refund: number;
  balance: number;
}) {
  const t = useT(nsPlayerTcg);
  const left = card.count - 1;
  const engaged = card.engagedCopies ?? 0;
  return (
    <div className="space-y-3 text-sm text-[var(--t2,#c7bfca)]">
      <dl className="space-y-1.5 rounded-xl border border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s2,#1d1520)] p-3">
        <div className="flex items-center justify-between gap-4">
          <dt className="text-[var(--t3,#a39ba6)]">{t.recycleConfirmGain}</dt>
          <dd>
            <TcgAmount
              value={refund}
              signed
              size={15}
              className="font-semibold text-[var(--lf,#7fca65)]"
            />
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="text-[var(--t3,#a39ba6)]">
            {t.recycleConfirmBalance}
          </dt>
          <dd className="flex items-center gap-2">
            <TcgAmount value={balance} size={15} />
            <span aria-hidden className="text-[var(--t4,#807984)]">
              →
            </span>
            <TcgAmount
              value={balance + refund}
              size={15}
              className="font-semibold text-[var(--t1,#f4edf7)]"
            />
          </dd>
        </div>
      </dl>
      <p>
        {left > 1
          ? format(t.recycleConfirmKeep_other, { count: left })
          : t.recycleConfirmKeep_one}
      </p>
      {/* Deux cas distincts : l'exemplaire désigné est lui-même promis
          (l'échange sera annulé), ou seule une autre copie l'est. */}
      {card.recyclableEngaged === true ? (
        <p className="rounded-lg border border-[rgba(245,165,36,.4)] bg-[rgba(245,165,36,.1)] p-2.5 text-[var(--warn,#f5a524)]">
          {t.recycleConfirmEngaged}
        </p>
      ) : engaged > 0 ? (
        <p>
          {engaged > 1
            ? format(t.recycleConfirmEngagedOther_other, { count: engaged })
            : t.recycleConfirmEngagedOther_one}
        </p>
      ) : null}
      <p className="text-[var(--t3,#a39ba6)]">{t.recycleConfirmWhich}</p>
    </div>
  );
}
