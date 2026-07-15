// components/admin/stages/[stageId]/AdvancedConfigSection.tsx
import React from 'react';
import type { Dict } from './stageDisplay';

type Props = {
  /** JSON pré-sérialisé (settings sans `advancement_rules`), mémoïsé côté page. */
  json: string;
  t: Dict;
};

/** Bloc « Configuration avancée » : dump JSON des settings hors advancement_rules. */
function AdvancedConfigSection({ json, t }: Props) {
  return (
    <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6">
      <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
        <svg
          className="w-5 h-5 text-neutral-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
          />
        </svg>
        {t.advancedConfigTitle}
      </h2>
      <p className="text-xs text-neutral-500 mb-4">{t.advancedConfigDesc}</p>
      <pre className="bg-neutral-900/80 border border-neutral-700 rounded-xl p-4 text-xs overflow-x-auto text-neutral-300 font-mono">
        {json}
      </pre>
    </section>
  );
}

export default React.memo(AdvancedConfigSection);
