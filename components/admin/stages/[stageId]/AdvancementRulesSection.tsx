// components/admin/stages/[stageId]/AdvancementRulesSection.tsx
import React from 'react';
import AdvancementRulesEditor from '@/components/admin/AdvancementRulesEditor';
import type { AdvancementRules } from '@/components/admin/AdvancementRulesEditor';
import type { StageType } from '@/types/admin';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import {
  rubanCardPadded,
  rubanCardTitle,
  rubanMuted,
} from '@/features/admin/_shared/ui/ruban';
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
    <section className={rubanCardPadded}>
      <h2 className={`${rubanCardTitle} mb-2`}>{t.advancementRulesTitle}</h2>
      <p className={`mb-4 text-xs ${rubanMuted}`}>{t.advancementRulesDesc}</p>

      <AdvancementRulesEditor
        value={value}
        availableStages={availableStages}
        onChange={onChange}
        disabled={saving}
        sourceStageType={sourceStageType}
      />

      <div className="mt-4 flex justify-end">
        <AdminButton
          variant="primary"
          size="sm"
          disabled={saving}
          onClick={onSave}
        >
          {saving ? t.advancementSaving : t.advancementSave}
        </AdminButton>
      </div>
    </section>
  );
}

export default React.memo(AdvancementRulesSection);
