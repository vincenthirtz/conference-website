// components/admin/stages/[stageId]/AdvancedConfigSection.tsx
import React from 'react';
import {
  CARD,
  CARD_TITLE,
  MUTED,
  TILE,
} from '@/features/admin/stages/ui/rubanClasses';
import type { Dict } from './stageDisplay';

type Props = {
  /** JSON pré-sérialisé (settings sans `advancement_rules`), mémoïsé côté page. */
  json: string;
  t: Dict;
};

/** Bloc « Configuration avancée » : dump JSON des settings hors advancement_rules. */
function AdvancedConfigSection({ json, t }: Props) {
  return (
    <section className={CARD}>
      <h2 className={`${CARD_TITLE} mb-2`}>{t.advancedConfigTitle}</h2>
      <p className={`mb-4 text-xs ${MUTED}`}>{t.advancedConfigDesc}</p>
      <pre
        className={`${TILE} overflow-x-auto p-4 font-mono text-xs text-[var(--t2,#c7bfca)]`}
      >
        {json}
      </pre>
    </section>
  );
}

export default React.memo(AdvancedConfigSection);
