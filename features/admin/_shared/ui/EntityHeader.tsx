// features/admin/_shared/ui/EntityHeader.tsx — en-tête d'entité de
// l'archétype Fiche (planche « AdminFiches ») : écusson, nom en capitales
// larges, ligne de provenance, et à droite l'état d'enregistrement et les
// actions.

import type { ReactNode } from 'react';

export default function EntityHeader({
  crest,
  title,
  meta,
  status,
  actions,
}: {
  /** Trois lettres (« HSP ») ou une image — l'écusson de l'entité. */
  crest?: ReactNode;
  title: ReactNode;
  /** « Créée le 30 août 2026 · modifiée il y a 2 h par Vincent ». */
  meta?: ReactNode;
  /** Pastille d'état à gauche des actions (« MODIFICATIONS NON ENREGISTRÉES »). */
  status?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
      <div className="flex min-w-0 items-center gap-4">
        {crest != null && (
          <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center overflow-hidden rounded-[var(--r-ctrl,4px)] border-l-[3px] border-[var(--or,#b467d1)] bg-[var(--s3,#2f2732)] font-[family-name:var(--fd)] text-[18px] font-extrabold text-[var(--t1,#f4edf7)] [font-stretch:75%]">
            {crest}
          </span>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-[clamp(26px,3.6vw,40px)] text-[var(--t1,#f4edf7)]">
            {title}
          </h1>
          {meta && (
            <p className="mt-1.5 text-[13px] text-[var(--t3,#a39ba6)]">
              {meta}
            </p>
          )}
        </div>
      </div>
      {(status || actions) && (
        <div className="flex flex-wrap items-center gap-2.5">
          {status}
          {actions}
        </div>
      )}
    </header>
  );
}
