// components/admin/stages/[stageId]/CompletionBanner.tsx
import React from 'react';
import { format } from '@/lib/i18n/useAdminT';
import type { StageType } from '@/types/admin';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import {
  CARD,
  CARD_TITLE,
  MUTED,
  TILE,
} from '@/features/admin/stages/ui/rubanClasses';
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
    <section className={`${CARD} !border-[rgba(127,202,101,.36)]`}>
      <h2 className={`${CARD_TITLE} mb-3`}>
        <Chip tone="ok">✓</Chip>
        {t.phaseCompleteTitle}
      </h2>

      <p className={`mb-4 text-sm ${MUTED}`}>
        {format(t.phaseCompleteDesc, {
          count: completionStatus.finishedMatches,
        })}
      </p>

      {completionStatus.canAdvance && completionStatus.nextStage && (
        <div className={`${TILE} flex items-center justify-between gap-4 p-4`}>
          <div>
            <div className="text-sm font-medium text-[var(--t1,#f4edf7)]">
              {format(t.advanceToward, {
                name: completionStatus.nextStage.name,
              })}
            </div>
            <div className={`text-xs ${MUTED}`}>
              {completionStatus.nextStage.stage_type
                ? stageTypeLabel(
                    completionStatus.nextStage.stage_type as StageType,
                    t
                  )
                : t.nextPhaseFallback}
            </div>
          </div>
          <AdminButton variant="primary" size="sm" onClick={onOpenAdvance}>
            {t.advanceTeams}
          </AdminButton>
        </div>
      )}

      {!completionStatus.canAdvance && !completionStatus.nextStage && (
        <p className={`text-xs ${MUTED}`}>{t.noNextPhase}</p>
      )}
    </section>
  );
}

export default React.memo(CompletionBanner);
