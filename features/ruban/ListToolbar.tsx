// features/ruban/ListToolbar.tsx — la ligne de filtres de
// l'archétype Liste : recherche, filtres « Statut : toutes ▾ », note de tri.
//
// Planche : « Ce qui change d'un écran à l'autre : les colonnes et les actions
// en lot. Jamais la position des filtres, la hauteur des lignes, la place du
// bouton de création. »

import { useId, type ReactNode } from 'react';

export function ListSearch({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** Nom accessible (le placeholder n'en est pas un). */
  label: string;
}) {
  const id = useId();
  return (
    <div className="flex h-[38px] w-full items-center gap-2.5 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 sm:w-[280px]">
      <svg
        aria-hidden
        width="14"
        height="14"
        viewBox="0 0 20 20"
        fill="none"
        className="shrink-0 text-[var(--t4,#807984)]"
      >
        <circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.7" />
        <path
          d="m13.2 13.2 3.3 3.3"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </svg>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--t1,#f4edf7)] outline-none"
      />
    </div>
  );
}

export function FilterSelect({
  label,
  allLabel,
  value,
  onChange,
  options,
}: {
  /** « Statut » — affiché devant la valeur : « STATUT : TOUTES ▾ ». */
  label: string;
  /** Libellé de l'option « tout » (valeur vide). */
  allLabel: string;
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  options: { value: string; label: string }[];
}) {
  const id = useId();
  const active = !!value;
  return (
    <div
      className={`relative inline-flex h-[38px] items-center gap-1.5 rounded-[var(--r-ctrl,4px)] border px-[13px] font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.12em] [font-stretch:75%] ${
        active
          ? 'border-[var(--or,#b467d1)] text-[var(--or-200,#eec4ff)]'
          : 'border-[var(--line2,rgba(194,196,201,.2))] text-[var(--t3,#a39ba6)]'
      }`}
    >
      <label htmlFor={id} className="whitespace-nowrap">
        {label} :
      </label>
      <select
        id={id}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="cursor-pointer appearance-none bg-transparent pr-3 uppercase outline-none"
      >
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <span
        aria-hidden
        className="pointer-events-none absolute right-[11px] text-[var(--t4,#807984)]"
      >
        ▾
      </span>
    </div>
  );
}

export default function ListToolbar({
  search,
  filters,
  note,
}: {
  search?: ReactNode;
  filters?: ReactNode;
  /** À droite : « Trié par nom ». */
  note?: ReactNode;
}) {
  return (
    <div className="mb-[18px] flex flex-wrap items-center gap-3">
      {search}
      {filters}
      {note && (
        <span className="ml-auto text-[11.5px] text-[var(--t4,#807984)]">
          {note}
        </span>
      )}
    </div>
  );
}
