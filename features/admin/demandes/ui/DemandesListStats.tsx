// features/admin/demandes/ui/DemandesListStats.tsx — les cinq tuiles de
// décompte de la liste des demandes (total + un statut chacune), en « Le Ruban ».
//
// Chaque tuile est un BOUTON qui filtre sur son statut : même allure que
// StatTile, mais cliquable (l'e2e admin-demandes les vise par rôle `button`).
// Le calcul du filtre et la navigation restent dans la page.

import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminDemandesList from '@/lib/i18n/locales/admin-fr/adminDemandesList';
import type { StatTone } from '@/features/admin/_shared/ui/StatTile';
import type { StatusCounts } from '@/features/admin/demandes/listModel';

const VALUE: Record<StatTone, string> = {
  neutral: 'text-[var(--t1,#f4edf7)]',
  ok: 'text-[var(--lf,#7fca65)]',
  warn: 'text-[var(--warn,#f5a524)]',
  err: 'text-[var(--err,#ff6b6b)]',
  brand: 'text-[var(--or-300,#dea3f6)]',
};

export default function DemandesListStats({
  counts,
  statusFilter,
  onSelect,
}: {
  counts: StatusCounts;
  statusFilter: string;
  /** Statut choisi ; `null` = tous (retire le filtre de l'URL). */
  onSelect: (status: string | null) => void;
}) {
  const t = useAdminT(nsAdminDemandesList);
  const cards: Array<{
    key: string;
    label: string;
    value: number;
    tone: StatTone;
    statusValue: string;
  }> = [
    {
      key: 'all',
      label: t.statTotal,
      value: counts.total,
      tone: 'neutral',
      statusValue: '',
    },
    {
      key: 'pending',
      label: t.statPending,
      value: counts.pending,
      tone: 'warn',
      statusValue: 'pending',
    },
    {
      key: 'approved',
      label: t.statApproved,
      value: counts.approved,
      tone: 'ok',
      statusValue: 'approved',
    },
    {
      key: 'rejected',
      label: t.statRejected,
      value: counts.rejected,
      tone: 'err',
      statusValue: 'rejected',
    },
    {
      key: 'cancelled',
      label: t.statCancelled,
      value: counts.cancelled,
      tone: 'neutral',
      statusValue: 'cancelled',
    },
  ];

  return (
    <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((card) => {
        const active =
          (card.statusValue ?? '') === (statusFilter ?? 'pending') ||
          (card.statusValue === '' && statusFilter === '');
        return (
          <button
            key={card.key}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(card.statusValue || null)}
            className={`rounded-[var(--r-card,14px)] border bg-[var(--s1,#100812)] p-4 text-left transition-colors hover:bg-[var(--s2,#1d1520)] ${
              active
                ? 'border-[var(--or,#b467d1)] ring-1 ring-[rgba(180,103,209,.4)]'
                : 'border-[var(--line2,rgba(194,196,201,.2))]'
            }`}
          >
            <span className="block font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--t3,#a39ba6)] [font-stretch:75%]">
              {card.label}
            </span>
            <span
              className={`mt-2 block font-[family-name:var(--fd)] text-[30px] font-extrabold leading-none [font-stretch:75%] ${VALUE[card.tone]}`}
              data-numeric
            >
              {card.value}
            </span>
          </button>
        );
      })}
    </div>
  );
}
