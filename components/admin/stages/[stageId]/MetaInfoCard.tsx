// components/admin/stages/[stageId]/MetaInfoCard.tsx
import React from 'react';
import type { Stage } from '@/types/admin';
import { type Dict, formatDateTime } from './stageDisplay';

type Props = {
  stage: Stage;
  t: Dict;
};

/** Carte « Informations système » (ids, dernière modification). */
function MetaInfoCard({ stage, t }: Props) {
  return (
    <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6">
      <h2 className="text-sm font-semibold text-neutral-400 mb-3">
        {t.sysInfoTitle}
      </h2>
      <div className="space-y-3 text-sm">
        <div>
          <div className="text-xs text-neutral-500 mb-1">{t.sysStageId}</div>
          <div className="font-mono text-xs bg-neutral-900 px-3 py-2 rounded-lg border border-neutral-700 break-all">
            {stage.id}
          </div>
        </div>
        <div>
          <div className="text-xs text-neutral-500 mb-1">
            {t.sysTournamentId}
          </div>
          <div className="font-mono text-xs bg-neutral-900 px-3 py-2 rounded-lg border border-neutral-700 break-all">
            {stage.tournament_id}
          </div>
        </div>
        <div>
          <div className="text-xs text-neutral-500 mb-1">
            {t.sysLastModified}
          </div>
          <div className="text-neutral-300">
            {formatDateTime(stage.updated_at || stage.created_at)}
          </div>
        </div>
      </div>
    </section>
  );
}

export default React.memo(MetaInfoCard);
