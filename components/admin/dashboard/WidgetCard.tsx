// components/admin/dashboard/WidgetCard.tsx
// Wrapper standard pour les cartes du mega-dashboard.

import Link from 'next/link';
import type { ReactNode } from 'react';

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
    <section
      className={`rounded-2xl border border-white/8 bg-white/[0.03] p-5 backdrop-blur-sm ${className}`}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-[11px] font-medium uppercase tracking-widest text-gray-400">
            {title}
          </h3>
          {badge !== undefined && badge !== null && badge !== '' && (
            <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-gray-400">
              {badge}
            </span>
          )}
        </div>
        {ctaHref && ctaLabel && (
          <Link
            href={ctaHref}
            className="text-[11px] text-purple-300 hover:text-purple-200 transition-colors"
          >
            {ctaLabel} →
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}
