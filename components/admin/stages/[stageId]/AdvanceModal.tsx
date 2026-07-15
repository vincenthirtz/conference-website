// components/admin/stages/[stageId]/AdvanceModal.tsx
import React from 'react';
import Modal from '@/components/admin/Modal';
import { format } from '@/lib/i18n/useAdminT';
import type { Dict } from './stageDisplay';
import AdvanceStandingsTable, {
  type AdvanceStanding,
} from './AdvanceStandingsTable';

type OtherStage = { id: string; name: string; stage_type: string | null };
type SeedMode = 'rank' | 'manual' | 'none';

type Props = {
  open: boolean;
  loading: boolean;
  submitting: boolean;
  otherStages: OtherStage[];
  targetStageId: string;
  standings: AdvanceStanding[];
  selectedIds: Set<string>;
  topN: string;
  minScore: string;
  minWins: string;
  seedMode: SeedMode;
  onClose: () => void;
  onChangeTarget: (id: string) => void;
  onTopN: (v: string) => void;
  onMinScore: (v: string) => void;
  onMinWins: (v: string) => void;
  onToggleTeam: (teamId: string) => void;
  onToggleAll: () => void;
  onChangeSeedMode: (m: SeedMode) => void;
  onSubmit: () => void;
  t: Dict;
};

/**
 * Modale « avancer les équipes ». Toute la logique de fetch/mutation reste dans
 * la page ; cette modale est présentationnelle et délègue la table des standings
 * au sous-composant mémoïsé `AdvanceStandingsTable`.
 */
function AdvanceModal({
  open,
  loading,
  submitting,
  otherStages,
  targetStageId,
  standings,
  selectedIds,
  topN,
  minScore,
  minWins,
  seedMode,
  onClose,
  onChangeTarget,
  onTopN,
  onMinScore,
  onMinWins,
  onToggleTeam,
  onToggleAll,
  onChangeSeedMode,
  onSubmit,
  t,
}: Props) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="2xl"
      panelClassName="max-h-[90vh]"
      title={
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <svg
            className="w-5 h-5 text-emerald-400"
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
          {t.advanceModalTitle}
        </h3>
      }
      footer={
        <div className="flex justify-between items-center w-full">
          <span className="text-xs text-neutral-500">
            {format(t.advanceSelectedCount, {
              count: selectedIds.size,
            })}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors"
            >
              {t.cancel}
            </button>
            <button
              onClick={onSubmit}
              disabled={submitting || selectedIds.size === 0 || !targetStageId}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {submitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {t.advanceSubmitting}
                </>
              ) : (
                t.advanceSubmit
              )}
            </button>
          </div>
        </div>
      }
    >
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-5">
          {/* Target stage selector */}
          <div>
            <label className="block text-sm text-neutral-400 mb-1">
              {t.targetStageLabel}
            </label>
            {otherStages.length === 0 ? (
              <p className="text-sm text-neutral-500">{t.noOtherStages}</p>
            ) : (
              <select
                value={targetStageId}
                onChange={(e) => onChangeTarget(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
              >
                {otherStages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.stage_type || t.stageTypeOtherFallback})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Criteria filters */}
          <div className="bg-neutral-900/50 border border-neutral-700 rounded-xl p-4 space-y-3">
            <p className="text-xs text-neutral-400 uppercase tracking-wider font-semibold mb-2">
              {t.criteriaTitle}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-neutral-500 mb-1">
                  {t.topNLabel}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={standings.length}
                    value={topN}
                    onChange={(e) => onTopN(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                    placeholder={t.topNPlaceholder}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-neutral-500 mb-1">
                  {t.minScoreLabel}
                </label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={minScore}
                  onChange={(e) => onMinScore(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                  placeholder={t.minScorePlaceholder}
                />
              </div>
              <div>
                <label className="block text-xs text-neutral-500 mb-1">
                  {t.minWinsLabel}
                </label>
                <input
                  type="number"
                  min={1}
                  value={minWins}
                  onChange={(e) => onMinWins(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                  placeholder={t.minWinsPlaceholder}
                />
              </div>
            </div>
            <p className="text-xs text-neutral-500">
              {format(t.advanceRatio, {
                selected: selectedIds.size,
                total: standings.length,
              })}
            </p>
          </div>

          {/* Standings table with checkboxes */}
          {standings.length > 0 ? (
            <AdvanceStandingsTable
              standings={standings}
              selectedIds={selectedIds}
              allSelected={selectedIds.size === standings.length}
              onToggleTeam={onToggleTeam}
              onToggleAll={onToggleAll}
              t={t}
            />
          ) : (
            <p className="text-sm text-neutral-500">{t.noStandings}</p>
          )}

          {/* Seed mode */}
          <div>
            <label className="block text-sm text-neutral-400 mb-2">
              {t.seedModeLabel}
            </label>
            <div className="flex flex-wrap gap-3">
              {(['rank', 'manual', 'none'] as const).map((mode) => (
                <label
                  key={mode}
                  className="flex items-center gap-2 text-sm cursor-pointer"
                >
                  <input
                    type="radio"
                    name="seedMode"
                    checked={seedMode === mode}
                    onChange={() => onChangeSeedMode(mode)}
                    className="border-neutral-500 bg-neutral-700"
                  />
                  <span>
                    {mode === 'rank' && t.seedModeRank}
                    {mode === 'manual' && t.seedModeManual}
                    {mode === 'none' && t.seedModeNone}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

export default React.memo(AdvanceModal);
