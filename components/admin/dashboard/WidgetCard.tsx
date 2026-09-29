// components/admin/dashboard/WidgetCard.tsx
// Wrapper standard pour les cartes du mega-dashboard.

import Link from 'next/link';
import type { ReactNode } from 'react';
import { rubanCard, rubanEyebrow } from '@/features/admin/_shared/ui/ruban';

type Props = {
  title: string;
  children: ReactNode;
  ctaHref?: string;
  ctaLabel?: string;
  /** Petit badge à droite du titre (ex: count, état). */
  badge?: ReactNode;
  /** className additionnel pour la carte. */
  className?: string;
};

export default function WidgetCard({
  title,
  children,
  ctaHref,
  ctaLabel,
  badge,
  className = '',
}: Props) {
  return (
    <section className={`${rubanCard} p-5 ${className}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className={rubanEyebrow}>{title}</h3>
          {badge !== undefined && badge !== null && badge !== '' && (
            <span className="rounded-[3px] border border-[var(--line2,rgba(194,196,201,.2))] px-1.5 py-0.5 text-[10px] tabular-nums text-[var(--t3,#a39ba6)]">
              {badge}
            </span>
          )}
        </div>
        {ctaHref && ctaLabel && (
          <Link
            href={ctaHref}
            className="text-[11px] text-[var(--or-200,#eec4ff)] transition-colors hover:text-[var(--t1,#f4edf7)]"
          >
            {ctaLabel} →
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}
