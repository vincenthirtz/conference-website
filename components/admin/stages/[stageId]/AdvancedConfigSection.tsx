// components/admin/stages/[stageId]/AdvancedConfigSection.tsx
import React from 'react';
import {
  rubanCardPadded,
  rubanCardTitle,
  rubanInset,
  rubanMuted,
} from '@/features/admin/_shared/ui/ruban';
import type { Dict } from './stageDisplay';

type Props = {
  /** JSON pré-sérialisé (settings sans `advancement_rules`), mémoïsé côté page. */
  json: string;
  t: Dict;
};

/** Bloc « Configuration avancée » : dump JSON des settings hors advancement_rules. */
function AdvancedConfigSection({ json, t }: Props) {
  return (
    <section className={rubanCardPadded}>
      <h2 className={`${rubanCardTitle} mb-2`}>{t.advancedConfigTitle}</h2>
      <p className={`mb-4 text-xs ${rubanMuted}`}>{t.advancedConfigDesc}</p>
      <pre
        className={`${rubanInset} overflow-x-auto p-4 font-mono text-xs text-[var(--t2,#c7bfca)]`}
      >
        {json}
      </pre>
    </section>
  );
}

export default React.memo(AdvancedConfigSection);
