// components/admin/stages/[stageId]/SwissStatusPanel.tsx
import React from 'react';
import { format } from '@/lib/i18n/useAdminT';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import StatTile from '@/features/admin/_shared/ui/StatTile';
import {
  CARD,
  CARD_TITLE,
  MUTED,
  OK_BOX,
  TILE,
  WARN_BOX,
} from '@/features/admin/stages/ui/rubanClasses';
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
    <section className={CARD}>
      <h2 className={`${CARD_TITLE} mb-4`}>{t.swissProgressTitle}</h2>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile
          tone="brand"
          label={t.swissCurrentRound}
          value={swissStatus.currentRound}
        />
        <StatTile
          label={t.swissTotalRounds}
          value={swissStatus.totalRounds ?? '∞'}
        />
        <StatTile
          tone="ok"
          label={format(t.swissFinishedMatches, {
            round: swissStatus.currentRound,
          })}
          value={swissStatus.roundStatus.finished}
        />
        <StatTile
          tone="warn"
          label={format(t.swissPendingMatches, {
            round: swissStatus.currentRound,
          })}
          value={
            swissStatus.roundStatus.pending + swissStatus.roundStatus.ongoing
          }
        />
      </div>

      {/* Progress bar */}
      {swissStatus.totalRounds && (
        <div className="mb-4">
          <div className={`mb-1 flex justify-between text-xs ${MUTED}`}>
            <span>{t.swissGlobalProgress}</span>
            <span className="font-mono">
              {format(t.swissRoundsProgress, {
                current: swissStatus.currentRound,
                total: swissStatus.totalRounds,
              })}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-[2px] bg-[var(--s3,#2f2732)]">
            <div
              className="h-full bg-[var(--or,#b467d1)] transition-all"
              style={{
                width: `${Math.min(100, (swissStatus.currentRound / swissStatus.totalRounds) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}

      {swissStatus.isComplete ? (
        <div className={`${OK_BOX} flex items-center gap-3`}>
          <Chip tone="ok">✓</Chip>
          <div>
            <div className="font-medium">{t.swissCompleteTitle}</div>
            <div className={`text-xs ${MUTED}`}>
              {format(t.swissCompleteDesc, {
                total: swissStatus.totalRounds ?? 0,
              })}
            </div>
          </div>
        </div>
      ) : swissStatus.canGenerateNext ? (
        <div className={`${WARN_BOX} flex items-center justify-between gap-3`}>
          <div>
            <div className="font-medium">
              {format(t.swissRoundDoneTitle, {
                round: swissStatus.currentRound,
              })}
            </div>
            <div className={`text-xs ${MUTED}`}>
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
          <AdminButton
            variant="primary"
            size="sm"
            onClick={onGenerateSwissRound}
            disabled={loadingActions}
          >
            {loadingActions && (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[rgba(15,10,18,.3)] border-t-[#0f0a12]" />
            )}
            {format(t.swissGenerateRound, {
              round: swissStatus.currentRound + 1,
            })}
          </AdminButton>
        </div>
      ) : (
        <div className={`${TILE} flex items-center gap-3 p-4`}>
          <Chip tone="neutral">…</Chip>
          <div>
            <div className="font-medium text-[var(--t2,#c7bfca)]">
              {format(t.swissRoundInProgressTitle, {
                round: swissStatus.currentRound,
              })}
            </div>
            <div className={`text-xs ${MUTED}`}>
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
