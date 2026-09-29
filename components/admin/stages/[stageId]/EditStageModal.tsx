// components/admin/stages/[stageId]/EditStageModal.tsx
import React from 'react';
import Modal from '@/components/admin/Modal';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import {
  rubanFormInput,
  rubanFormLabel,
} from '@/features/admin/_shared/ui/ruban';
import type { Dict } from './stageDisplay';

export type EditForm = {
  name: string;
  tournament_id: string;
  is_active: boolean;
  is_public: boolean;
};

type Props = {
  open: boolean;
  editForm: EditForm;
  allTournaments: { id: string; name: string }[];
  saving: boolean;
  onClose: () => void;
  onChange: (patch: Partial<EditForm>) => void;
  onSave: () => void;
  t: Dict;
};

/**
 * Modale d'édition de la phase. L'état `editForm` et le handler de sauvegarde
 * réseau restent dans la page ; on passe des callbacks stables. `React.memo`
 * fige la modale (fermée → rien rendu par `Modal`) tant qu'aucune de ses props
 * ne change.
 */
function EditStageModal({
  open,
  editForm,
  allTournaments,
  saving,
  onClose,
  onChange,
  onSave,
  t,
}: Props) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t.editModalTitle}
      footer={
        <>
          <AdminButton size="sm" onClick={onClose}>
            {t.cancel}
          </AdminButton>
          <AdminButton
            variant="primary"
            size="sm"
            onClick={onSave}
            disabled={saving || !editForm.name.trim()}
          >
            {saving ? t.saving : t.save}
          </AdminButton>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className={rubanFormLabel}>{t.editNameLabel}</label>
          <input
            type="text"
            value={editForm.name}
            onChange={(e) => onChange({ name: e.target.value })}
            className={rubanFormInput}
          />
        </div>

        <div>
          <label className={rubanFormLabel}>{t.editTournamentLabel}</label>
          <select
            value={editForm.tournament_id}
            onChange={(e) => onChange({ tournament_id: e.target.value })}
            className={rubanFormInput}
          >
            <option value="">{t.editNoTournament}</option>
            {allTournaments.map((tm) => (
              <option key={tm.id} value={tm.id}>
                {tm.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--t2,#c7bfca)]">
            <input
              type="checkbox"
              checked={editForm.is_active}
              onChange={(e) => onChange({ is_active: e.target.checked })}
            />
            <span>{t.editActiveLabel}</span>
          </label>

          <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--t2,#c7bfca)]">
            <input
              type="checkbox"
              checked={editForm.is_public}
              onChange={(e) => onChange({ is_public: e.target.checked })}
            />
            <span>{t.editPublicLabel}</span>
          </label>
        </div>
      </div>
    </Modal>
  );
}

export default React.memo(EditStageModal);
