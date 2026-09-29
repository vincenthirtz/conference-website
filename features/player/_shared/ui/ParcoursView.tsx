// features/player/_shared/ui/ParcoursView.tsx — archétype PARCOURS (lot P8) :
// création d'équipe, adhésion, check-in à jeton. Des étapes, UNE décision
// par écran. Au changement d'étape, le focus va sur son titre et la position
// (« Étape 2 sur 3 ») est annoncée.
//
// Composé du kit features/ruban (PageHeader, Card, Button) — aucune brique
// définie ici.

import { useEffect, useRef, type ReactNode } from 'react';
import { Button, Card, PageHeader } from '@/features/ruban';
import ActionDock from './ActionDock';

export type ParcoursStep = { key: string; label: string };

export default function ParcoursView({
  title,
  steps,
  current,
  progressLabel,
  position,
  backLabel,
  onBack,
  next,
  children,
}: {
  title: ReactNode;
  steps: ParcoursStep[];
  /** Index (0-based) de l'étape affichée. */
  current: number;
  /** Nom de la liste des étapes (« Progression »). */
  progressLabel: string;
  /** « Étape 2 sur 3 », annoncé à chaque changement. */
  position: string;
  backLabel?: string;
  /** Absent à la première étape : pas de retour. */
  onBack?: () => void;
  /** L'action qui fait avancer (un `Button` primaire du kit). */
  next: ReactNode;
  children: ReactNode;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  useEffect(() => {
    // Pas au premier rendu : la page vient de s'ouvrir, le focus est à elle.
    if (first.current) {
      first.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [current]);
  const step = steps[current];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col px-4 pb-6 lg:px-6">
      <PageHeader title={title} />
      <ol aria-label={progressLabel} className="mb-4 flex gap-1.5">
        {steps.map((s, i) => (
          <li
            key={s.key}
            aria-current={i === current ? 'step' : undefined}
            className={`h-1.5 flex-1 rounded-full ${
              i <= current
                ? 'bg-[var(--or,#b467d1)]'
                : 'bg-[var(--line2,rgba(194,196,201,.2))]'
            }`}
          >
            <span className="sr-only">{s.label}</span>
          </li>
        ))}
      </ol>
      <p
        role="status"
        aria-live="polite"
        className="mb-2 text-[13px] text-[var(--t3,#a39ba6)]"
      >
        {position}
      </p>
      <Card as="section" padding="sm" aria-labelledby={`parcours-${step?.key}`}>
        <h2
          id={`parcours-${step?.key}`}
          ref={headingRef}
          tabIndex={-1}
          className="mb-4 text-[19px] text-[var(--t1,#f4edf7)]"
        >
          {step?.label}
        </h2>
        {children}
      </Card>
      <div className="mt-6">
        <ActionDock>
          {onBack && backLabel && (
            <Button variant="ghost" onClick={onBack}>
              {backLabel}
            </Button>
          )}
          {next}
        </ActionDock>
      </div>
    </div>
  );
}
