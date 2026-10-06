// components/admin/stages/[stageId]/AdvanceModal.tsx
import React from 'react';
import Modal from '@/components/admin/Modal';
import { format } from '@/lib/i18n/useAdminT';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import {
  rubanEyebrowSnug,
  rubanFormInput,
  rubanFormLabel,
  rubanInset,
  rubanMuted,
} from '@/features/admin/_shared/ui/ruban';
import type { Dict } from './stageDisplay';
import AdvanceStandingsTable, {
  type AdvanceStanding,
} from './AdvanceStandingsTable';
import type { TiebreakerOverride } from '@/features/admin/stages/client';
import type { OverrideDraft } from '@/features/admin/stages/hooks/useTiebreakerOverrides';

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
  /** Dérogations de départage, transmises à la table (cf. elle). */
  overrides?: TiebreakerOverride[];
  overrideSaving?: boolean;
  onAddOverride?: (draft: OverrideDraft) => Promise<boolean>;
  onRemoveOverride?: (ov: TiebreakerOverride) => void;
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
  overrides,
  overrideSaving,
  onAddOverride,
  onRemoveOverride,
}: Props) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="2xl"
      panelClassName="max-h-[90vh]"
      title={
        <h3 className="text-[17px] text-[var(--t1,#f4edf7)]">
          {t.advanceModalTitle}
        </h3>
      }
      footer={
        <div className="flex justify-between items-center w-full">
          <span className={`text-xs ${rubanMuted}`}>
            {format(t.advanceSelectedCount, {
              count: selectedIds.size,
            })}
          </span>
          <div className="flex gap-2">
            <AdminButton size="sm" onClick={onClose}>
              {t.cancel}
            </AdminButton>
            <AdminButton
              variant="primary"
              size="sm"
              onClick={onSubmit}
              disabled={submitting || selectedIds.size === 0 || !targetStageId}
            >
              {submitting ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[rgba(15,10,18,.3)] border-t-[#0f0a12]" />
                  {t.advanceSubmitting}
                </>
              ) : (
                t.advanceSubmit
              )}
            </AdminButton>
          </div>
        </div>
      }
    >
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--line2,rgba(194,196,201,.2))] border-t-[var(--or,#b467d1)]" />
        </div>
      ) : (
        <div className="space-y-5">
          {/* Target stage selector */}
          <div>
            <label className={rubanFormLabel}>{t.targetStageLabel}</label>
            {otherStages.length === 0 ? (
              <p className={`text-sm ${rubanMuted}`}>{t.noOtherStages}</p>
            ) : (
              <select
                value={targetStageId}
                onChange={(e) => onChangeTarget(e.target.value)}
                className={rubanFormInput}
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
          <div className={`${rubanInset} space-y-3 p-4`}>
            <p className={`${rubanEyebrowSnug} mb-2`}>{t.criteriaTitle}</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="mb-1 block text-xs text-[var(--t3,#a39ba6)]">
                  {t.topNLabel}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={standings.length}
                    value={topN}
                    onChange={(e) => onTopN(e.target.value)}
                    className={rubanFormInput}
                    placeholder={t.topNPlaceholder}
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-[var(--t3,#a39ba6)]">
                  {t.minScoreLabel}
                </label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={minScore}
                  onChange={(e) => onMinScore(e.target.value)}
                  className={rubanFormInput}
                  placeholder={t.minScorePlaceholder}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[var(--t3,#a39ba6)]">
                  {t.minWinsLabel}
                </label>
                <input
                  type="number"
                  min={1}
                  value={minWins}
                  onChange={(e) => onMinWins(e.target.value)}
                  className={rubanFormInput}
                  placeholder={t.minWinsPlaceholder}
                />
              </div>
            </div>
            <p className={`text-xs ${rubanMuted}`}>
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
              overrides={overrides}
              overrideSaving={overrideSaving}
              onAddOverride={onAddOverride}
              onRemoveOverride={onRemoveOverride}
            />
          ) : (
            <p className={`text-sm ${rubanMuted}`}>{t.noStandings}</p>
          )}

          {/* Seed mode */}
          <div>
            <label className="mb-2 block text-sm text-[var(--t2,#c7bfca)]">
              {t.seedModeLabel}
            </label>
            <div className="flex flex-wrap gap-3">
              {(['rank', 'manual', 'none'] as const).map((mode) => (
                <label
                  key={mode}
                  className="flex cursor-pointer items-center gap-2 text-sm text-[var(--t2,#c7bfca)]"
                >
                  <input
                    type="radio"
                    name="seedMode"
                    checked={seedMode === mode}
                    onChange={() => onChangeSeedMode(mode)}
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
