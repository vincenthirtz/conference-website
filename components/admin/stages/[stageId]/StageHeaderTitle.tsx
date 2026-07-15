// components/admin/stages/[stageId]/StageHeaderTitle.tsx
import React from 'react';
import Link from 'next/link';
import type { Stage, Tournament } from '@/types/admin';
import {
  type Dict,
  stageTypeColor,
  stageTypeIcon,
  stageTypeLabel,
} from './stageDisplay';

type Props = {
  stage: Stage | null;
  tournament: Tournament | null;
  tournamentDashboardUrl: string;
  t: Dict;
};

/**
 * Bloc titre du header (icône + nom + badges de type + lien tournoi). Purement
 * présentationnel : ne dépend que de `stage`/`tournament` (stables entre deux
 * frappes de formulaire), donc `React.memo` court-circuite sa reconciliation.
 */
function StageHeaderTitle({
  stage,
  tournament,
  tournamentDashboardUrl,
  t,
}: Props) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-center gap-4">
        {stage && (
          <div
            className={`w-14 h-14 rounded-xl flex items-center justify-center border ${stageTypeColor(stage.stage_type)}`}
          >
            {stageTypeIcon(stage.stage_type)}
          </div>
        )}
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
              {stage?.name || t.loadingName}
            </h1>
            {stage && (
              <span
                className={`px-3 py-1 rounded-full text-sm font-medium border ${stageTypeColor(stage.stage_type)}`}
              >
                {stageTypeLabel(stage.stage_type, t)}
              </span>
            )}
          </div>
          {tournament && (
            <p className="text-sm text-neutral-400 mt-1 flex items-center gap-2">
              <span>{t.tournamentPrefix}</span>
              <Link
                href={tournamentDashboardUrl}
                className="text-blue-400 hover:text-blue-300 transition-colors"
              >
                {tournament.name}
              </Link>
              {stage?.slug && (
                <>
                  <span>•</span>
                  <span className="font-mono text-xs bg-neutral-800/80 px-2 py-0.5 rounded">
                    /{stage.slug}
                  </span>
                </>
              )}
            </p>
          )}
        </div>
      </div>

      {stage && (
        <div className="flex flex-wrap items-center gap-2">
          {stage.is_active && (
            <span className="px-3 py-1.5 rounded-full text-sm font-semibold bg-emerald-600/20 text-emerald-300 border border-emerald-500/30">
              {t.badgeActive}
            </span>
          )}
          {stage.is_public && (
            <span className="px-3 py-1.5 rounded-full text-sm font-semibold bg-blue-600/20 text-blue-300 border border-blue-500/30">
              {t.badgePublic}
            </span>
          )}
          {!stage.is_active && !stage.is_public && (
            <span className="px-3 py-1.5 rounded-full text-sm font-semibold bg-neutral-700/50 text-neutral-400 border border-neutral-600/30">
              {t.badgeDraft}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default React.memo(StageHeaderTitle);
