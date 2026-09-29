// features/admin/events/ui/DirectorSectionTitle.tsx — titre de colonne du
// Director (`pages/admin/events/[runId]/director.tsx`) en « Le Ruban » :
// capitales étroites espacées, comme les « eyebrow » des fiches, et une note
// à droite si besoin (« glisser pour réordonner »).
//
// Sorti de la page, gelée en taille (`adminFileSizeGuard`) : cinq titres
// identiques y tenaient chacun trois lignes.

import type { ReactNode } from 'react';

export default function DirectorSectionTitle({
  children,
  note,
}: {
  children: ReactNode;
  note?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="font-[family-name:var(--fd)] text-[12px] font-bold uppercase tracking-[0.22em] text-[var(--t3,#a39ba6)] [font-stretch:75%]">
        {children}
      </h2>
      {note && <span className="text-xs text-[var(--t4,#807984)]">{note}</span>}
    </div>
  );
}
