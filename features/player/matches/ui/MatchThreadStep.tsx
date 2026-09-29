// features/player/matches/ui/MatchThreadStep.tsx — une étape du fil du match
// (archétype FIL, lot P12). Une carte du kit, titrée, dont la pastille porte
// la seule information qui compte au premier coup d'œil : à moi de faire,
// fait, ou encore fermé.

import type { ReactNode } from 'react';
import { Card, Chip } from '@/features/ruban';
import type { StepState } from '../threadState';

const TONE = { done: 'ok', active: 'brand', idle: 'neutral' } as const;

export default function MatchThreadStep({
  index,
  title,
  state,
  children,
  id,
}: {
  index: number;
  title: string;
  state: StepState;
  children: ReactNode;
  /** Ancre (ex. `#checkin`, visée par la feuille de match). */
  id?: string;
}) {
  return (
    <Card
      as="section"
      padding="sm"
      id={id}
      data-step-state={state}
      className="scroll-mt-24"
    >
      <h2 className="flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.14em] text-[var(--t2,#c7bfca)]">
        <span aria-hidden>
          <Chip tone={TONE[state]}>{state === 'done' ? '✓' : index}</Chip>
        </span>
        {title}
      </h2>
      {/* Les étapes changent d'état sous le doigt (check-in confirmé, feuille
          validée) : sans `aria-live`, un lecteur d'écran ne dit rien de ce qui
          vient de se passer et la personne reclique. */}
      <div
        className="mt-3 text-[15px] text-[var(--t2,#c7bfca)]"
        aria-live="polite"
      >
        {children}
      </div>
    </Card>
  );
}
