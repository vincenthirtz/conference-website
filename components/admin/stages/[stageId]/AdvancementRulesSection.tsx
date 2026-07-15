// components/admin/stages/[stageId]/AdvancementRulesSection.tsx
import React from 'react';
import AdvancementRulesEditor from '@/components/admin/AdvancementRulesEditor';
import type { AdvancementRules } from '@/components/admin/AdvancementRulesEditor';
import type { StageType } from '@/types/admin';
import type { Dict } from './stageDisplay';

type Props = {
  value: AdvancementRules | null;
  availableStages: { id: string; name: string; stage_type: string | null }[];
  onChange: (v: AdvancementRules | null) => void;
  saving: boolean;
  sourceStageType: StageType | null;
  onSave: () => void;
  t: Dict;
};

/**
 * Section « Règles d'avancement » : wrappe l'éditeur + son bouton d'enregistrement.
 * L'état du brouillon (`value`) et le handler réseau (`onSave`) vivent dans la
 * page ; ce composant reste présentationnel.
 */
function AdvancementRulesSection({
  value,
  availableStages,
  onChange,
  saving,
  sourceStageType,
  onSave,
  t,
}: Props) {
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
            d="M13 7l5 5m0 0l-5 5m5-5H6"
          />
        </svg>
        {t.advancementRulesTitle}
      </h2>
      <p className="text-xs text-neutral-500 mb-4">{t.advancementRulesDesc}</p>

      <AdvancementRulesEditor
        value={value}
        availableStages={availableStages}
        onChange={onChange}
        disabled={saving}
        sourceStageType={sourceStageType}
      />

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          disabled={saving}
          onClick={onSave}
          className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
            saving
              ? 'bg-blue-800 cursor-wait text-blue-200'
              : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
        >
          {saving ? t.advancementSaving : t.advancementSave}
        </button>
      </div>
    </section>
  );
}

export default React.memo(AdvancementRulesSection);
