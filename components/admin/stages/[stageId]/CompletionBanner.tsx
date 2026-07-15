// components/admin/stages/[stageId]/CompletionBanner.tsx
import React from 'react';
import { format } from '@/lib/i18n/useAdminT';
import type { StageType } from '@/types/admin';
import { type Dict, stageTypeLabel } from './stageDisplay';

export type CompletionStatus = {
  totalMatches: number;
  finishedMatches: number;
  pendingMatches: number;
  ongoingMatches: number;
  isComplete: boolean;
  nextStage: { id: string; name: string; stage_type: string | null } | null;
  canAdvance: boolean;
};

type Props = {
  completionStatus: CompletionStatus;
  onOpenAdvance: () => void;
  t: Dict;
};

/**
 * Bannière « phase terminée / avancer ». Rendue par la page uniquement quand
 * `completionStatus.totalMatches > 0 && isComplete`.
 */
function CompletionBanner({ completionStatus, onOpenAdvance, t }: Props) {
  return (
    <section className="bg-emerald-900/20 backdrop-blur border border-emerald-700/40 rounded-2xl p-6">
      <h2 className="text-lg font-semibold mb-3 flex items-center gap-2 text-emerald-200">
        <svg
          className="w-5 h-5 text-emerald-400"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
            clipRule="evenodd"
          />
        </svg>
        {t.phaseCompleteTitle}
      </h2>

      <p className="text-sm text-emerald-300/80 mb-4">
        {format(t.phaseCompleteDesc, {
          count: completionStatus.finishedMatches,
        })}
      </p>

      {completionStatus.canAdvance && completionStatus.nextStage && (
        <div className="bg-emerald-900/30 border border-emerald-600/40 rounded-xl p-4 flex items-center justify-between gap-4">
          <div>
            <div className="font-medium text-emerald-200 text-sm">
              {format(t.advanceToward, {
                name: completionStatus.nextStage.name,
              })}
            </div>
            <div className="text-xs text-emerald-400/60">
              {completionStatus.nextStage.stage_type
                ? stageTypeLabel(
                    completionStatus.nextStage.stage_type as StageType,
                    t
                  )
                : t.nextPhaseFallback}
            </div>
          </div>
          <button
            onClick={onOpenAdvance}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-sm font-medium transition-colors flex-shrink-0 flex items-center gap-2"
          >
            <svg
              className="w-4 h-4"
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
            {t.advanceTeams}
          </button>
        </div>
      )}

      {!completionStatus.canAdvance && !completionStatus.nextStage && (
        <p className="text-xs text-emerald-400/60">{t.noNextPhase}</p>
      )}
    </section>
  );
}

export default React.memo(CompletionBanner);
