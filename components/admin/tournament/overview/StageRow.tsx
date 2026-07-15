import { memo } from 'react';
import Link from 'next/link';
import { stageTypeColor, stageTypeLabel } from './labels';
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
      className="flex items-center justify-between gap-3 bg-neutral-900/50 hover:bg-neutral-900 rounded-xl px-4 py-3 transition-colors group"
    >
      <div className="flex items-center gap-3">
        <span className="text-xs font-mono text-neutral-500 w-6">
          {(stage.order_index ?? 0) + 1}.
        </span>
        <div>
          <div className="font-medium text-sm group-hover:text-white transition-colors">
            {stage.name}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span
              className={`px-2 py-0.5 rounded-full text-xs border ${stageTypeColor(
                stage.stage_type
              )}`}
            >
              {stageTypeLabel(tx, stage.stage_type)}
            </span>
            {stage.is_active && (
              <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                {tx.stageActive}
              </span>
            )}
            {stage.is_public && (
              <span className="px-2 py-0.5 rounded-full text-xs bg-blue-500/20 text-blue-300 border border-blue-500/30">
                {tx.stagePublic}
              </span>
            )}
          </div>
        </div>
      </div>
      <svg
        className="w-5 h-5 text-neutral-500 group-hover:text-white transition-colors"
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
