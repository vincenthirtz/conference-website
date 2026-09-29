// features/ruban/PageHeader.tsx — l'en-tête d'un écran (admin, espace joueuse)
// (planches « Le Ruban ») : titre large en capitales, sous-titre chiffré,
// actions à droite. La coquille porte déjà le fil d'Ariane.

import type { ReactNode } from 'react';

export default function PageHeader({
  title,
  subtitle,
  actions,
  badge,
  level = 1,
}: {
  title: ReactNode;
  /** Une ligne factuelle, chiffrée de préférence (« 12 équipes au total »). */
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** Pastille à droite du titre (« EN COURS »). */
  badge?: ReactNode;
  /**
   * 2 pour un panneau logé dans un hub à onglets, dont la page porte déjà le
   * `h1` : même allure, bon niveau de titre.
   */
  level?: 1 | 2;
}) {
  const Heading = level === 2 ? 'h2' : 'h1';
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <Heading className="font-[family-name:var(--fd)] text-[clamp(28px,4vw,44px)] font-extrabold uppercase leading-[.95] tracking-[-0.022em] text-[var(--t1,#f4edf7)] [font-stretch:125%]">
            {title}
          </Heading>
          {badge}
        </div>
        {subtitle && (
          <p className="mt-2 text-[15px] text-[var(--t2,#c7bfca)]" data-numeric>
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2.5">{actions}</div>}
    </header>
  );
}
