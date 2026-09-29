// features/admin/tasks/ui/TaskBoardStates.tsx — bandeau d'erreur et encarts
// d'état (chargement, vide) du tableau de tâches.

import type { ReactNode } from 'react';
import { TB_SURFACE } from './taskBoardClasses';

export function TaskBoardErrorBanner({ children }: { children: ReactNode }) {
  return (
    <div className="mb-6 rounded-[var(--r-card,14px)] border border-[rgba(255,107,107,.4)] bg-[rgba(255,107,107,.08)] p-4 text-[#ffc2c2]">
      {children}
    </div>
  );
}

export function TaskBoardLoading({
  children,
  compact = false,
}: {
  children: ReactNode;
  /** Variante fine, au-dessus du board pendant un rechargement. */
  compact?: boolean;
}) {
  return (
    <div
      className={`${TB_SURFACE} text-sm text-[var(--t3,#a39ba6)] ${
        compact ? 'mb-4 p-3' : 'p-4'
      }`}
    >
      {children}
    </div>
  );
}

export function TaskBoardEmpty({
  title,
  hint,
}: {
  title: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className={`p-8 text-center ${TB_SURFACE}`}>
      <p className="text-sm text-[var(--t2,#c7bfca)]">{title}</p>
      {hint && <p className="mt-1 text-xs text-[var(--t4,#807984)]">{hint}</p>}
    </div>
  );
}
