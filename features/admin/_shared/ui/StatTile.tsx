// features/admin/_shared/ui/StatTile.tsx — tuile de chiffre des planches
// (« CHECK-IN 6 / 8 — équipes pointées ») : libellé étroit espacé, grand
// chiffre condensé, une ligne d'appoint. La couleur signale, elle ne décore
// pas : une tuile en erreur prend aussi une bordure d'erreur.

import type { ReactNode } from 'react';

export type StatTone = 'neutral' | 'ok' | 'warn' | 'err' | 'brand';

const VALUE: Record<StatTone, string> = {
  neutral: 'text-[var(--t1,#f4edf7)]',
  ok: 'text-[var(--lf,#7fca65)]',
  warn: 'text-[var(--warn,#f5a524)]',
  err: 'text-[var(--err,#ff6b6b)]',
  brand: 'text-[var(--or-300,#dea3f6)]',
};

export default function StatTile({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: StatTone;
}) {
  return (
    <div
      className={`rounded-[var(--r-card,14px)] border bg-[var(--s1,#100812)] p-5 ${
        tone === 'err'
          ? 'border-[rgba(255,107,107,.45)]'
          : 'border-[var(--line2,rgba(194,196,201,.2))]'
      }`}
    >
      <p className="font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--t3,#a39ba6)] [font-stretch:75%]">
        {label}
      </p>
      <p
        className={`mt-3 font-[family-name:var(--fd)] text-[36px] font-extrabold leading-none [font-stretch:75%] ${VALUE[tone]}`}
        data-numeric
      >
        {value}
      </p>
      {hint && (
        <p className="mt-3 text-[12.5px] text-[var(--t3,#a39ba6)]">{hint}</p>
      )}
    </div>
  );
}
