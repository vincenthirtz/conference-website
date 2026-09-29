// components/admin/stages/[stageId]/AutoSeedModal.tsx
import React from 'react';
import Modal from '@/components/admin/Modal';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import {
  rubanFormInput,
  rubanFormLabel,
  rubanMuted,
} from '@/features/admin/_shared/ui/ruban';
import type { Dict } from './stageDisplay';

type OtherStage = { id: string; name: string; stage_type: string | null };

type Props = {
  open: boolean;
  loading: boolean;
  otherStages: OtherStage[];
  sourceStageId: string;
  pattern: 'standard' | 'sequential';
  submitting: boolean;
  onClose: () => void;
  onChangeSource: (id: string) => void;
  onChangePattern: (p: 'standard' | 'sequential') => void;
  onSubmit: () => void;
  t: Dict;
};

/** Modale d'auto-seed d'un bracket depuis une phase source (swiss/group/rr). */
function AutoSeedModal({
  open,
  loading,
  otherStages,
  sourceStageId,
  pattern,
  submitting,
  onClose,
  onChangeSource,
  onChangePattern,
  onSubmit,
  t,
}: Props) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <h3 className="text-[17px] text-[var(--t1,#f4edf7)]">
          {t.autoSeedModalTitle}
        </h3>
      }
      footer={
        <>
          <AdminButton size="sm" onClick={onClose}>
            {t.cancel}
          </AdminButton>
          <AdminButton
            variant="primary"
            size="sm"
            onClick={onSubmit}
            disabled={submitting || !sourceStageId || otherStages.length === 0}
          >
            {submitting ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[rgba(15,10,18,.3)] border-t-[#0f0a12]" />
                {t.autoSeedSubmitting}
              </>
            ) : (
              t.autoSeedApply
            )}
          </AdminButton>
        </>
      }
    >
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--line2,rgba(194,196,201,.2))] border-t-[var(--or,#b467d1)]" />
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className={rubanFormLabel}>{t.sourceStageLabel}</label>
            {otherStages.length === 0 ? (
              <p className={`text-sm ${rubanMuted}`}>{t.noSourceStages}</p>
            ) : (
              <select
                value={sourceStageId}
                onChange={(e) => onChangeSource(e.target.value)}
                className={rubanFormInput}
              >
                {otherStages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.stage_type})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="mb-2 block text-sm text-[var(--t2,#c7bfca)]">
              {t.methodLabel}
            </label>
            <div className="space-y-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--t2,#c7bfca)]">
                <input
                  type="radio"
                  name="autoSeedPattern"
                  checked={pattern === 'standard'}
                  onChange={() => onChangePattern('standard')}
                />
                <div>
                  <span className="font-medium">{t.patternStandard}</span>
                  <span className={`ml-1 ${rubanMuted}`}>
                    {t.patternStandardDesc}
                  </span>
                </div>
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--t2,#c7bfca)]">
                <input
                  type="radio"
                  name="autoSeedPattern"
                  checked={pattern === 'sequential'}
                  onChange={() => onChangePattern('sequential')}
                />
                <div>
                  <span className="font-medium">{t.patternSequential}</span>
                  <span className={`ml-1 ${rubanMuted}`}>
                    {t.patternSequentialDesc}
                  </span>
                </div>
              </label>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

export default React.memo(AutoSeedModal);
