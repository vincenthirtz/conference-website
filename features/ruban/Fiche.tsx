// features/ruban/Fiche.tsx — la mise en page de l'archétype Fiche
// (planche « AdminFiches ») : le formulaire à gauche, métadonnées et
// historique à droite, zone sensible en bas du formulaire.

import type { ReactNode } from 'react';

export function FicheLayout({
  main,
  aside,
}: {
  main: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_330px]">
      <div className="flex min-w-0 flex-col gap-6">{main}</div>
      {aside && <aside className="flex flex-col gap-6">{aside}</aside>}
    </div>
  );
}

/** Une carte de la fiche : titre en capitales, contenu. */
export function FicheSection({
  title,
  aside,
  children,
  eyebrow = false,
}: {
  title: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  /** Titre en « eyebrow » étroit (cartes de la colonne de droite). */
  eyebrow?: boolean;
}) {
  return (
    <section className="rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-6">
      <header className="mb-5 flex items-baseline justify-between gap-3">
        <h2
          className={
            eyebrow
              ? 'font-[family-name:var(--fd,Archivo,sans-serif)] text-[12px] font-bold uppercase tracking-[0.22em] text-[var(--t3,#a39ba6)] [font-stretch:75%]'
              : 'text-[19px] text-[var(--t1,#f4edf7)]'
          }
        >
          {title}
        </h2>
        {aside}
      </header>
      {children}
    </section>
  );
}

/** Métadonnées : libellé à gauche, valeur en chasse fixe à droite. */
export function MetaList({
  items,
}: {
  items: { label: ReactNode; value: ReactNode }[];
}) {
  return (
    <dl className="flex flex-col">
      {items.map((item, i) => (
        <div
          key={i}
          className="flex items-baseline justify-between gap-4 border-b border-[var(--line,rgba(194,196,201,.12))] py-2.5 last:border-0"
        >
          <dt className="text-[12.5px] text-[var(--t3,#a39ba6)]">
            {item.label}
          </dt>
          <dd className="truncate text-right font-mono text-[12.5px] text-[var(--t1,#f4edf7)]">
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
