// components/admin/dashboard/ActionableAlert.tsx
// Bandeau d'alerte cliquable avec un CTA direct vers la page de résolution.
// Utilisé dans le mega-dashboard pour faire remonter les signaux actionnables.

import Link from 'next/link';
import type { ReactNode } from 'react';

export type AlertSeverity = 'info' | 'warning' | 'error' | 'critical';

const STYLES: Record<
  AlertSeverity,
  { wrapper: string; iconWrap: string; cta: string }
> = {
  info: {
    wrapper: 'border-blue-500/30 bg-blue-500/5',
    iconWrap: 'text-blue-300 bg-blue-500/10',
    cta: 'text-blue-200 hover:bg-blue-500/15',
  },
  warning: {
    wrapper: 'border-amber-500/30 bg-amber-500/5',
    iconWrap: 'text-amber-300 bg-amber-500/10',
    cta: 'text-amber-200 hover:bg-amber-500/15',
  },
  error: {
    wrapper: 'border-red-500/30 bg-red-500/5',
    iconWrap: 'text-red-300 bg-red-500/10',
    cta: 'text-red-200 hover:bg-red-500/15',
  },
  critical: {
    wrapper: 'border-red-600/50 bg-red-600/10 ring-1 ring-red-600/30',
    iconWrap: 'text-red-200 bg-red-600/20 animate-pulse',
    cta: 'text-red-100 hover:bg-red-600/20',
  },
};

type Props = {
  severity: AlertSeverity;
  icon?: ReactNode;
  title: string;
  message?: ReactNode;
  cta?: { label: string; href: string };
};

export default function ActionableAlert({
  severity,
  icon,
  title,
  message,
  cta,
}: Props) {
  const s = STYLES[severity];
  return (
    <div
      className={`flex items-center gap-3 rounded-xl border p-3 ${s.wrapper}`}
    >
      {icon && (
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${s.iconWrap}`}
        >
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">{title}</p>
        {message !== undefined && message !== null && message !== '' && (
          <p className="mt-0.5 truncate text-xs text-gray-300">{message}</p>
        )}
      </div>
      {cta && (
        <Link
          href={cta.href}
          className={`shrink-0 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium transition-colors ${s.cta}`}
        >
          {cta.label} →
        </Link>
      )}
    </div>
  );
}
