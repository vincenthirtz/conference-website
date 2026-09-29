import { memo } from 'react';
import Link from 'next/link';
import Chip from '@/features/admin/_shared/ui/Chip';
import { stageTypeLabel } from './labels';
import type { Dict, Stage } from './types';

type StageRowProps = {
  stage: Stage;
  tx: Dict;
};

/**
 * Single stage row (link) in the tournament overview Stages section.
 * Pure/memoized: re-renders only when its own stage or the dictionary change.
 */
function StageRow({ stage, tx }: StageRowProps) {
  return (
    <Link
      href={`/admin/stages/${stage.id}`}
      className="group flex items-center justify-between gap-3 rounded-[var(--r-ctrl,4px)] border border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s2,#1d1520)] px-4 py-3 transition-colors hover:border-[var(--or,#b467d1)]"
    >
      <div className="flex items-center gap-3">
        <span className="w-6 font-mono text-xs text-[var(--t4,#807984)]">
          {(stage.order_index ?? 0) + 1}.
        </span>
        <div>
          <div className="text-sm font-medium text-[var(--t1,#f4edf7)]">
            {stage.name}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <Chip>{stageTypeLabel(tx, stage.stage_type)}</Chip>
            {stage.is_active && <Chip tone="live">{tx.stageActive}</Chip>}
            {stage.is_public && <Chip tone="brand">{tx.stagePublic}</Chip>}
          </div>
        </div>
      </div>
      <svg
        className="h-5 w-5 text-[var(--t4,#807984)] transition-colors group-hover:text-[var(--or-200,#eec4ff)]"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 5l7 7-7 7"
        />
      </svg>
    </Link>
  );
}

export default memo(StageRow);
