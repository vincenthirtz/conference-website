// features/admin/tournaments/ui/TournamentDashboardCard.tsx — la carte des
// sections du hub tournoi (pages/admin/tournament/[id]/dashboard.tsx) en
// « Le Ruban » : surface s1, trait line2, titre étroit en capitales, compteur
// à droite du titre, lien de sortie (« Gérer → ») à droite.
//
// Pendant de `components/admin/dashboard/WidgetCard`, qui reste en place pour
// les cartes TCG : même contrat (title / badge / ctaHref / ctaLabel).

import Link from 'next/link';
import type { ReactNode } from 'react';

export const DASH_SECTION_TITLE =
  'font-[family-name:var(--fd)] text-[13px] font-bold uppercase tracking-[0.18em] text-[var(--t1,#f4edf7)] [font-stretch:75%]';

/** Texte d'état vide / d'attente à l'intérieur d'une carte. */
export const DASH_MUTED = 'text-sm text-[var(--t3,#a39ba6)]';

/** Point pulsé des états en cours (direct, mise à jour). */
export const DASH_PULSE_DOT = 'h-1.5 w-1.5 animate-pulse rounded-full';

const BORDER = {
  none: 'border-[var(--line2,rgba(194,196,201,.2))]',
  live: 'border-[rgba(127,202,101,.45)]',
  err: 'border-[rgba(255,107,107,.45)]',
} as const;

export default function TournamentDashboardCard({
  title,
  children,
  ctaHref,
  ctaLabel,
  badge,
  tone,
  className = '',
}: {
  title: string;
  children: ReactNode;
  ctaHref?: string;
  ctaLabel?: string;
  /** Petit compteur / état à droite du titre. */
  badge?: ReactNode;
  /** Bordure de signal : direct (vert) ou litige (erreur). */
  tone?: 'live' | 'err';
  className?: string;
}) {
  return (
    <section
      className={`rounded-[var(--r-card,14px)] border bg-[var(--s1,#100812)] p-5 ${BORDER[tone ?? 'none']} ${className}`}
    >
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className={DASH_SECTION_TITLE}>{title}</h2>
          {badge !== undefined && badge !== null && badge !== '' && (
            <span
              className="inline-flex h-[20px] items-center gap-1 rounded-[3px] border border-[var(--line2,rgba(194,196,201,.2))] px-1.5 text-[11px] font-bold text-[var(--t2,#c7bfca)] tabular-nums"
              data-numeric
            >
              {badge}
            </span>
          )}
        </div>
        {ctaHref && ctaLabel && (
          <Link
            href={ctaHref}
            className="text-[12px] font-semibold text-[var(--or-300,#dea3f6)] transition-colors hover:text-[var(--or-200,#eec4ff)]"
          >
            {ctaLabel} →
          </Link>
        )}
      </header>
      {children}
    </section>
  );
}
