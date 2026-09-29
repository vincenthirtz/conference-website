// components/admin/dashboard/StatCard.tsx
// Carte KPI réutilisable pour le mega-dashboard. Remplace les divs inline
// utilisés dans /admin/tournament/[id].tsx.

import type { ReactNode } from 'react';

export type StatAccent =
  | 'pink'
  | 'blue'
  | 'emerald'
  | 'purple'
  | 'amber'
  | 'red'
  | 'gray';

// Couleur = signal : les teintes décoratives (pink/blue/purple) se rangent
// sous l'orchidée, seules emerald/amber/red disent un état.
const ACCENT_TEXT: Record<StatAccent, string> = {
  pink: 'text-[var(--or-300,#dea3f6)]',
  blue: 'text-[var(--or-300,#dea3f6)]',
  emerald: 'text-[var(--lf,#7fca65)]',
  purple: 'text-[var(--or-300,#dea3f6)]',
  amber: 'text-[var(--warn,#f5a524)]',
  red: 'text-[var(--err,#ff6b6b)]',
  gray: 'text-[var(--t1,#f4edf7)]',
};

type Props = {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  accent?: StatAccent;
  /** Optional small icon prepended to the label. */
  icon?: ReactNode;
};

export default function StatCard({
  label,
  value,
  hint,
  accent = 'gray',
  icon,
}: Props) {
  return (
    <div
      className={`rounded-[var(--r-card,14px)] border bg-[var(--s1,#100812)] p-4 ${
        accent === 'red'
          ? 'border-[rgba(255,107,107,.45)]'
          : 'border-[var(--line2,rgba(194,196,201,.2))]'
      }`}
    >
      <div className="flex items-center gap-1.5 font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--t3,#a39ba6)] [font-stretch:75%]">
        {icon && <span className="opacity-80">{icon}</span>}
        <span>{label}</span>
      </div>
      <div
        className={`mt-2 font-[family-name:var(--fd)] text-[28px] font-extrabold leading-none [font-stretch:75%] ${ACCENT_TEXT[accent]}`}
        data-numeric
      >
        {value}
      </div>
      {hint !== undefined && hint !== null && hint !== '' && (
        <div className="mt-2 text-[11px] text-[var(--t3,#a39ba6)]">{hint}</div>
      )}
    </div>
  );
}
