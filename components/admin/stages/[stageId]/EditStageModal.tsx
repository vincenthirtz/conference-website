// components/admin/stages/[stageId]/EditStageModal.tsx
import React from 'react';
import Modal from '@/components/admin/Modal';
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
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors"
          >
            {t.cancel}
          </button>
          <button
            onClick={onSave}
            disabled={saving || !editForm.name.trim()}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? t.saving : t.save}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm text-neutral-400 mb-1">
            {t.editNameLabel}
          </label>
          <input
            type="text"
            value={editForm.name}
            onChange={(e) => onChange({ name: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm text-neutral-400 mb-1">
            {t.editTournamentLabel}
          </label>
          <select
            value={editForm.tournament_id}
            onChange={(e) => onChange({ tournament_id: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={editForm.is_active}
              onChange={(e) => onChange({ is_active: e.target.checked })}
              className="rounded border-neutral-500 bg-neutral-700"
            />
            <span>{t.editActiveLabel}</span>
          </label>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={editForm.is_public}
              onChange={(e) => onChange({ is_public: e.target.checked })}
              className="rounded border-neutral-500 bg-neutral-700"
            />
            <span>{t.editPublicLabel}</span>
          </label>
        </div>
      </div>
    </Modal>
  );
}

export default React.memo(EditStageModal);
