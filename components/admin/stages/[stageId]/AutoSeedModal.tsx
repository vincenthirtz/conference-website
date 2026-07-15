// components/admin/stages/[stageId]/AutoSeedModal.tsx
import React from 'react';
import Modal from '@/components/admin/Modal';
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
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <svg
            className="w-5 h-5 text-purple-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
            />
          </svg>
          {t.autoSeedModalTitle}
        </h3>
      }
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
            disabled={submitting || !sourceStageId || otherStages.length === 0}
            className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {submitting ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {t.autoSeedSubmitting}
              </>
            ) : (
              t.autoSeedApply
            )}
          </button>
        </>
      }
    >
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-neutral-400 mb-1">
              {t.sourceStageLabel}
            </label>
            {otherStages.length === 0 ? (
              <p className="text-sm text-neutral-500">{t.noSourceStages}</p>
            ) : (
              <select
                value={sourceStageId}
                onChange={(e) => onChangeSource(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
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
            <label className="block text-sm text-neutral-400 mb-2">
              {t.methodLabel}
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="autoSeedPattern"
                  checked={pattern === 'standard'}
                  onChange={() => onChangePattern('standard')}
                  className="border-neutral-500 bg-neutral-700"
                />
                <div>
                  <span className="font-medium">{t.patternStandard}</span>
                  <span className="text-neutral-500 ml-1">
                    {t.patternStandardDesc}
                  </span>
                </div>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="autoSeedPattern"
                  checked={pattern === 'sequential'}
                  onChange={() => onChangePattern('sequential')}
                  className="border-neutral-500 bg-neutral-700"
                />
                <div>
                  <span className="font-medium">{t.patternSequential}</span>
                  <span className="text-neutral-500 ml-1">
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
