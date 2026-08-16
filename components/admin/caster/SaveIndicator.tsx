// components/admin/caster/SaveIndicator.tsx
//
// Indicateur d'auto-save partagé par tous les éditeurs de scènes caster —
// extrait de MatchSceneEditor (lot 1), rendu identique.

import { useAdminT } from '@/lib/i18n/useAdminT';
import type { SaveState } from './useSceneDraft';
import nsAdminCasterScenes from '@/lib/i18n/locales/admin-fr/adminCasterScenes';

export default function SaveIndicator({ state }: { state: SaveState }) {
  const t = useAdminT(nsAdminCasterScenes);
  return (
    <div className="flex items-center justify-end min-h-[1rem]">
      <span
        role="status"
        aria-live="polite"
        className={`text-[11px] font-medium ${
          state === 'error'
            ? 'text-red-300'
            : state === 'saving'
              ? 'text-amber-300'
              : 'text-neutral-500'
        }`}
        data-testid="caster-save-indicator"
      >
        {state === 'saving'
          ? t.saveSaving
          : state === 'saved'
            ? t.saveSaved
            : state === 'error'
              ? t.saveErrorShort
              : ''}
      </span>
    </div>
  );
}
