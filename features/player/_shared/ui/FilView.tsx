// features/player/_shared/ui/FilView.tsx — archétype FIL (lot P8) : tableau
// de bord, fil du match, notifications. Des cartes empilées (une colonne à
// 375 px, deux à partir de `lg`), l'état courant annoncé (`aria-live`), et
// l'action principale en bas, sous le pouce.
//
// Composé du kit features/ruban (PageHeader ; les cartes passées en enfants
// sont des `Card`) — aucune brique définie ici.

import type { ReactNode } from 'react';
import { PageHeader } from '@/features/ruban';
import ActionDock from './ActionDock';

export default function FilView({
  title,
  subtitle,
  actions,
  status,
  primaryAction,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Actions secondaires, à droite du titre. */
  actions?: ReactNode;
  /** Dernière mise à jour du fil (« 2 nouveautés »), annoncée poliment. */
  status?: ReactNode;
  /** L'action principale, collée en bas du pouce. */
  primaryAction?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col px-4 pb-6 lg:px-6">
      <PageHeader title={title} subtitle={subtitle} actions={actions} />
      <p
        role="status"
        aria-live="polite"
        className="mb-4 min-h-[1.25rem] text-[13px] text-[var(--t3,#a39ba6)] empty:mb-0 empty:min-h-0"
      >
        {status}
      </p>
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start">
        {children}
      </div>
      {primaryAction && (
        <div className="mt-6">
          <ActionDock>{primaryAction}</ActionDock>
        </div>
      )}
    </div>
  );
}
