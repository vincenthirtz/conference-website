// components/admin/stages/[stageId]/StageOverviewCard.tsx
import React from 'react';
import type { Stage } from '@/types/admin';
import { type Dict, formatDateTime, stageTypeLabel } from './stageDisplay';

type Props = {
  stage: Stage;
  t: Dict;
};

/** Carte « Informations » (type, ordre, statut, dates). Purement dérivée de `stage`. */
function StageOverviewCard({ stage, t }: Props) {
  return (
    <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <svg
          className="w-5 h-5 text-neutral-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        {t.infoTitle}
      </h2>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-neutral-900/50 rounded-xl p-4">
          <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">
            {t.infoType}
          </div>
          <div className="font-medium">
            {stageTypeLabel(stage.stage_type, t)}
          </div>
        </div>

        <div className="bg-neutral-900/50 rounded-xl p-4">
          <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">
            {t.infoOrder}
          </div>
          <div className="font-medium">
            {stage.order_index !== null ? `#${stage.order_index + 1}` : '—'}
          </div>
        </div>

        <div className="bg-neutral-900/50 rounded-xl p-4">
          <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">
            {t.infoStatus}
          </div>
          <div className="font-medium">
            {stage.is_active ? t.statusActive : t.statusInactive}
          </div>
        </div>

        <div className="bg-neutral-900/50 rounded-xl p-4">
          <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">
            {t.infoStartDate}
          </div>
          <div className="font-medium text-sm">
            {formatDateTime(stage.start_date)}
          </div>
        </div>

        <div className="bg-neutral-900/50 rounded-xl p-4">
          <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">
            {t.infoEndDate}
          </div>
          <div className="font-medium text-sm">
            {formatDateTime(stage.end_date)}
          </div>
        </div>

        <div className="bg-neutral-900/50 rounded-xl p-4">
          <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">
            {t.infoCreatedAt}
          </div>
          <div className="font-medium text-sm">
            {formatDateTime(stage.created_at)}
          </div>
        </div>
      </div>
    </section>
  );
}

export default React.memo(StageOverviewCard);
