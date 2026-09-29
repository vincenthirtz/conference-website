// features/player/_shared/ui/FicheView.tsx — archétype FICHE (lot P8) :
// profil, équipe, scrim. En-tête d'entité, sections REPLIABLES (une fiche
// longue se parcourt au pouce), barre d'action collante.
//
// Composé du kit features/ruban (FicheLayout, Card ; l'en-tête reçu est un
// `EntityHeader`) — aucune brique définie ici.

import type { ReactNode } from 'react';
import { Card, FicheLayout } from '@/features/ruban';
import ActionDock from './ActionDock';

export default function FicheView({
  header,
  aside,
  status,
  actions,
  children,
}: {
  /** `EntityHeader` du kit. */
  header: ReactNode;
  /** Colonne de droite à partir de `xl` (métadonnées, historique). */
  aside?: ReactNode;
  /** Résultat de la dernière action (« Enregistré »), annoncé poliment. */
  status?: ReactNode;
  /** Actions de la fiche, collées en bas du pouce. */
  actions?: ReactNode;
  /** Des `FicheFold`. */
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col px-4 pb-6 lg:px-6">
      {header}
      <p
        role="status"
        aria-live="polite"
        className="mb-4 text-[13px] text-[var(--t3,#a39ba6)] empty:mb-0"
      >
        {status}
      </p>
      <FicheLayout main={children} aside={aside} />
      {actions && (
        <div className="mt-6">
          <ActionDock>{actions}</ActionDock>
        </div>
      )}
    </div>
  );
}

/**
 * Une section repliable de la fiche : `<details>` natif (clavier, lecteur
 * d'écran et état ouvert/fermé sans script), dans une `Card` du kit. Le
 * résumé est une cible de 44 px.
 */
export function FicheFold({
  title,
  defaultOpen = true,
  children,
}: {
  title: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <Card as="section" padding="none">
      <details open={defaultOpen} className="group">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2 font-[family-name:var(--fd,Archivo,sans-serif)] text-[15px] font-bold uppercase tracking-[0.02em] text-[var(--t1,#f4edf7)] [&::-webkit-details-marker]:hidden">
          <span>{title}</span>
          <span
            aria-hidden
            className="text-[var(--t3,#a39ba6)] transition-transform group-open:rotate-180"
          >
            ▾
          </span>
        </summary>
        <div className="border-t border-[var(--line,rgba(194,196,201,.12))] p-4">
          {children}
        </div>
      </details>
    </Card>
  );
}
