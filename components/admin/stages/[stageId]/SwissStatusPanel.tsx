// components/admin/stages/[stageId]/SwissStatusPanel.tsx
import React from 'react';
import { format } from '@/lib/i18n/useAdminT';
import type { Dict } from './stageDisplay';

export type SwissStatus = {
  currentRound: number;
  totalRounds: number | null;
  roundStatus: {
    round: number;
    total: number;
    finished: number;
    pending: number;
    ongoing: number;
  };
  allCurrentRoundFinished: boolean;
  canGenerateNext: boolean;
  isComplete: boolean;
};

type Props = {
  swissStatus: SwissStatus;
  loadingActions: boolean;
  onGenerateSwissRound: () => void;
  t: Dict;
};

/** Panneau de progression Swiss. Rendu uniquement lorsque `swissStatus` est chargé. */
function SwissStatusPanel({
  swissStatus,
  loadingActions,
  onGenerateSwissRound,
  t,
}: Props) {
  return (
    <section className="bg-neutral-800/50 backdrop-blur border border-amber-700/30 rounded-2xl p-6">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <svg
          className="w-5 h-5 text-amber-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
        {t.swissProgressTitle}
      </h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="bg-neutral-900/50 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-amber-300">
            {swissStatus.currentRound}
          </div>
          <div className="text-xs text-neutral-500">{t.swissCurrentRound}</div>
        </div>
        <div className="bg-neutral-900/50 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold">
            {swissStatus.totalRounds ?? '∞'}
          </div>
          <div className="text-xs text-neutral-500">{t.swissTotalRounds}</div>
        </div>
        <div className="bg-neutral-900/50 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-emerald-400">
            {swissStatus.roundStatus.finished}
          </div>
          <div className="text-xs text-neutral-500">
            {format(t.swissFinishedMatches, {
              round: swissStatus.currentRound,
            })}
          </div>
        </div>
        <div className="bg-neutral-900/50 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-orange-400">
            {swissStatus.roundStatus.pending + swissStatus.roundStatus.ongoing}
          </div>
          <div className="text-xs text-neutral-500">
            {format(t.swissPendingMatches, {
              round: swissStatus.currentRound,
            })}
          </div>
        </div>
      </div>

      {/* Progress bar */}
      {swissStatus.totalRounds && (
        <div className="mb-4">
          <div className="flex justify-between text-xs text-neutral-500 mb-1">
            <span>{t.swissGlobalProgress}</span>
            <span>
              {format(t.swissRoundsProgress, {
                current: swissStatus.currentRound,
                total: swissStatus.totalRounds,
              })}
            </span>
          </div>
          <div className="h-2 bg-neutral-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-500 rounded-full transition-all"
              style={{
                width: `${Math.min(100, (swissStatus.currentRound / swissStatus.totalRounds) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}

      {swissStatus.isComplete ? (
        <div className="bg-emerald-900/30 border border-emerald-700/50 rounded-xl p-4 flex items-center gap-3">
          <svg
            className="w-6 h-6 text-emerald-400 flex-shrink-0"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
          <div>
            <div className="font-medium text-emerald-300">
              {t.swissCompleteTitle}
            </div>
            <div className="text-xs text-emerald-400/70">
              {format(t.swissCompleteDesc, {
                total: swissStatus.totalRounds ?? 0,
              })}
            </div>
          </div>
        </div>
      ) : swissStatus.canGenerateNext ? (
        <div className="bg-amber-900/20 border border-amber-700/50 rounded-xl p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <svg
              className="w-6 h-6 text-amber-400 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
            <div>
              <div className="font-medium text-amber-200">
                {format(t.swissRoundDoneTitle, {
                  round: swissStatus.currentRound,
                })}
              </div>
              <div className="text-xs text-amber-400/70">
                {format(t.swissRoundDoneDesc, {
                  next: swissStatus.currentRound + 1,
                  suffix: swissStatus.totalRounds
                    ? format(t.swissRoundSuffix, {
                        total: swissStatus.totalRounds,
                      })
                    : '',
                })}
              </div>
            </div>
          </div>
          <button
            onClick={onGenerateSwissRound}
            disabled={loadingActions}
            className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-sm font-medium transition-colors flex-shrink-0 disabled:opacity-50 flex items-center gap-2"
          >
            {loadingActions ? (
              <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
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
                  d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                />
              </svg>
            )}
            {format(t.swissGenerateRound, {
              round: swissStatus.currentRound + 1,
            })}
          </button>
        </div>
      ) : (
        <div className="bg-neutral-900/50 border border-neutral-700 rounded-xl p-4 flex items-center gap-3">
          <div className="w-6 h-6 text-neutral-500">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div>
            <div className="font-medium text-neutral-300">
              {format(t.swissRoundInProgressTitle, {
                round: swissStatus.currentRound,
              })}
            </div>
            <div className="text-xs text-neutral-500">
              {format(t.swissRoundInProgressDesc, {
                count:
                  swissStatus.roundStatus.pending +
                  swissStatus.roundStatus.ongoing,
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default React.memo(SwissStatusPanel);
