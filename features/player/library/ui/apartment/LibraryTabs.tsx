// features/player/library/ui/apartment/LibraryTabs.tsx — les panneaux sous
// l'appartement (boutique, meubles, avatar, réglages), en onglets ARIA :
// flèches gauche / droite, Début / Fin. Présentationnel : chaque panneau
// arrive déjà rendu.

import { type KeyboardEvent, type ReactNode, useId, useRef } from 'react';

export type LibraryTab = { id: string; label: string; panel: ReactNode };

export default function LibraryTabs({
  tabs,
  active,
  onChange,
  label,
}: {
  tabs: readonly LibraryTab[];
  active: string;
  onChange: (id: string) => void;
  label: string;
}) {
  const base = useId();
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const index = Math.max(
    0,
    tabs.findIndex((t) => t.id === active)
  );
  const current = tabs[index];

  const onKey = (e: KeyboardEvent) => {
    const last = tabs.length - 1;
    const next =
      e.key === 'ArrowRight'
        ? index === last
          ? 0
          : index + 1
        : e.key === 'ArrowLeft'
          ? index === 0
            ? last
            : index - 1
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? last
              : null;
    if (next === null) return;
    e.preventDefault();
    onChange(tabs[next].id);
    refs.current.get(tabs[next].id)?.focus();
  };

  return (
    <div className="flex flex-col gap-4">
      <div
        role="tablist"
        aria-label={label}
        className="flex flex-wrap gap-1 border-b border-[var(--line,rgba(194,196,201,.12))]"
      >
        {tabs.map((tab) => {
          const selected = tab.id === current?.id;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                if (el) refs.current.set(tab.id, el);
                else refs.current.delete(tab.id);
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${base}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(tab.id)}
              onKeyDown={onKey}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition-colors ${
                selected
                  ? 'border-[var(--or,#b467d1)] text-[var(--t1,#f4edf7)]'
                  : 'border-transparent text-[var(--t3,#a39ba6)] hover:text-[var(--t1,#f4edf7)]'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {current && (
        <div
          role="tabpanel"
          id={`${base}-panel-${current.id}`}
          aria-labelledby={`${base}-tab-${current.id}`}
        >
          {current.panel}
        </div>
      )}
    </div>
  );
}
