// components/admin/stages/[stageId]/StageHeaderTitle.tsx
import React from 'react';
import Link from 'next/link';
import type { Stage, Tournament } from '@/types/admin';
import EntityHeader from '@/features/admin/_shared/ui/EntityHeader';
import Chip from '@/features/admin/_shared/ui/Chip';
import { type Dict, stageTypeIcon, stageTypeLabel } from './stageDisplay';

type Props = {
  stage: Stage | null;
  tournament: Tournament | null;
  tournamentDashboardUrl: string;
  t: Dict;
};

/**
 * En-tête d'entité de la phase (écusson du type + nom + puces d'état + lien
 * tournoi). Purement présentationnel : ne dépend que de `stage`/`tournament`
 * (stables entre deux frappes de formulaire), donc `React.memo` court-circuite
 * sa reconciliation.
 */
function StageHeaderTitle({
  stage,
  tournament,
  tournamentDashboardUrl,
  t,
}: Props) {
  return (
    <EntityHeader
      crest={
        stage ? (
          <span className="text-[var(--or-300,#dea3f6)]">
            {stageTypeIcon(stage.stage_type)}
          </span>
        ) : undefined
      }
      title={stage?.name || t.loadingName}
      meta={
        tournament && (
          <span className="flex flex-wrap items-center gap-2">
            <span>{t.tournamentPrefix}</span>
            <Link
              href={tournamentDashboardUrl}
              className="text-[var(--or-200,#eec4ff)] transition-colors hover:text-[var(--t1,#f4edf7)]"
            >
              {tournament.name}
            </Link>
            {stage?.slug && (
              <>
                <span>•</span>
                <span className="rounded-[3px] bg-[var(--s2,#1d1520)] px-2 py-0.5 font-mono text-xs">
                  /{stage.slug}
                </span>
              </>
            )}
          </span>
        )
      }
      status={
        stage && (
          <>
            <Chip tone="brand">{stageTypeLabel(stage.stage_type, t)}</Chip>
            {stage.is_active && <Chip tone="ok">{t.badgeActive}</Chip>}
            {stage.is_public && <Chip tone="brand">{t.badgePublic}</Chip>}
            {!stage.is_active && !stage.is_public && (
              <Chip tone="neutral">{t.badgeDraft}</Chip>
            )}
          </>
        )
      }
    />
  );
}

export default React.memo(StageHeaderTitle);
