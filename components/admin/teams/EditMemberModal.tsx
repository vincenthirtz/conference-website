import React from 'react';
import { useAdminT } from '@/lib/i18n/useAdminT';
import Modal from '@/components/admin/Modal';
import type { TeamMemberRow } from '@/types/admin';
import type { TeamRole } from '@/utils/teamRoles';
import type { MemberFormState } from './types';
import nsAdminTeamsEditMemberModal from '@/lib/i18n/locales/admin-fr/adminTeamsEditMemberModal';

type EditMemberModalProps = {
  open: boolean;
  onClose: () => void;
  editingMember: TeamMemberRow | null;
  teamRoles: TeamRole[];
  memberForm: MemberFormState;
  setMemberForm: React.Dispatch<React.SetStateAction<MemberFormState>>;
  memberSaving: boolean;
  memberError: string | null;
  onSubmit: () => void;
};

function EditMemberModalComponent({
  open,
  onClose,
  editingMember,
  teamRoles,
  memberForm,
  setMemberForm,
  memberSaving,
  memberError,
  onSubmit,
}: EditMemberModalProps) {
  const t = useAdminT(nsAdminTeamsEditMemberModal);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t.title}
      footer={
        <>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors"
          >
            {t.cancel}
          </button>
          <button
            onClick={onSubmit}
            disabled={memberSaving}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {memberSaving && (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            )}
            {memberSaving ? t.saving : t.save}
          </button>
        </>
      }
    >
      {editingMember && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-neutral-400 mb-1">
              User ID
            </label>
            <div className="font-mono text-xs bg-neutral-900 px-3 py-2 rounded-lg border border-neutral-700 break-all">
              {editingMember.user_id}
            </div>
          </div>

          <div>
            <label className="block text-sm text-neutral-400 mb-1">
              BattleTag
            </label>
            <input
              type="text"
              value={memberForm.battleTag}
              onChange={(e) =>
                setMemberForm((prev) => ({
                  ...prev,
                  battleTag: e.target.value,
                }))
              }
              className="w-full px-3 py-2 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              placeholder="Pseudo#1234"
            />
          </div>

          <div>
            <label className="block text-sm text-neutral-400 mb-1">
              {t.skillRatingLabel}
            </label>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={5000}
              step={50}
              value={memberForm.skillRating}
              onChange={(e) =>
                setMemberForm((prev) => ({
                  ...prev,
                  skillRating: e.target.value,
                }))
              }
              className="w-full px-3 py-2 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              placeholder="3500"
            />
            <p className="mt-1 text-xs text-neutral-500">{t.skillRatingHint}</p>
          </div>

          <div>
            <label className="block text-sm text-neutral-400 mb-1">
              {t.roleLabel}
            </label>
            <select
              value={memberForm.role}
              onChange={(e) =>
                setMemberForm((prev) => ({ ...prev, role: e.target.value }))
              }
              className="w-full px-3 py-2 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            >
              {teamRoles.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={memberForm.isSubstitute}
              onChange={(e) =>
                setMemberForm((prev) => ({
                  ...prev,
                  isSubstitute: e.target.checked,
                }))
              }
              className="h-4 w-4 rounded border-neutral-600 bg-neutral-700"
            />
            <span>{t.substitute}</span>
          </label>

          {memberError && (
            <div className="rounded-lg bg-red-900/40 border border-red-500/50 px-3 py-2 text-sm text-red-200">
              {memberError}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

const EditMemberModal = React.memo(EditMemberModalComponent);

export default EditMemberModal;
