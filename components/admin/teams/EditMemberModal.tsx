import React from 'react';
import { useAdminT } from '@/lib/i18n/useAdminT';
import Modal from '@/components/admin/Modal';
import type { TeamMemberRow } from '@/types/admin';
import type { TeamRole } from '@/utils/teamRoles';
import type { MemberFormState } from './types';
import nsAdminTeamsEditMemberModal from '@/lib/i18n/locales/admin-fr/adminTeamsEditMemberModal';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';

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
          <AdminButton variant="ghost" size="sm" onClick={onClose}>
            {t.cancel}
          </AdminButton>
          <AdminButton
            variant="primary"
            size="sm"
            onClick={onSubmit}
            disabled={memberSaving}
          >
            {memberSaving && (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            )}
            {memberSaving ? t.saving : t.save}
          </AdminButton>
        </>
      }
    >
      {editingMember && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-neutral-400 mb-1">
              User ID
            </label>
            <div className="font-mono text-xs bg-[var(--s2,#1d1520)] px-3 py-2 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] break-all">
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
              className="w-full px-3 py-2 rounded-[var(--r-ctrl,4px)] bg-[var(--s2,#1d1520)] border border-[var(--line2,rgba(194,196,201,.2))] focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              placeholder="Pseudo#1234"
            />
          </div>

          <div>
            <label className="block text-sm text-neutral-400 mb-1">
              {t.specialtyLabel}
            </label>
            <select
              value={memberForm.specialty}
              onChange={(e) =>
                setMemberForm((prev) => ({
                  ...prev,
                  specialty: e.target.value,
                }))
              }
              className="w-full px-3 py-2 rounded-[var(--r-ctrl,4px)] bg-[var(--s2,#1d1520)] border border-[var(--line2,rgba(194,196,201,.2))] focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            >
              <option value="">{t.specialtyNone}</option>
              <option value="tank">{t.specialtyTank}</option>
              <option value="dps">{t.specialtyDps}</option>
              <option value="support">{t.specialtySupport}</option>
              <option value="flex">{t.specialtyFlex}</option>
            </select>
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
              className="w-full px-3 py-2 rounded-[var(--r-ctrl,4px)] bg-[var(--s2,#1d1520)] border border-[var(--line2,rgba(194,196,201,.2))] focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
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
              className="w-full px-3 py-2 rounded-[var(--r-ctrl,4px)] bg-[var(--s2,#1d1520)] border border-[var(--line2,rgba(194,196,201,.2))] focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
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
              className="h-4 w-4 rounded-[var(--r-ctrl,4px)] border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s3,#2f2732)]"
            />
            <span>{t.substitute}</span>
          </label>

          {memberError && (
            <div className="rounded-[var(--r-ctrl,4px)] bg-red-900/40 border border-red-500/50 px-3 py-2 text-sm text-red-200">
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
