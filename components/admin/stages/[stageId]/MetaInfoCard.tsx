// components/admin/stages/[stageId]/MetaInfoCard.tsx
import React from 'react';
import type { Stage } from '@/types/admin';
import { FicheSection, MetaList } from '@/features/admin/_shared/ui/Fiche';
import { type Dict, formatDateTime } from './stageDisplay';

type Props = {
  stage: Stage;
  t: Dict;
};

/** Carte « Informations système » (ids, dernière modification). */
function MetaInfoCard({ stage, t }: Props) {
  return (
    <FicheSection title={t.sysInfoTitle} eyebrow>
      <MetaList
        items={[
          {
            label: t.sysStageId,
            value: <span title={stage.id}>{stage.id}</span>,
          },
          {
            label: t.sysTournamentId,
            value: (
              <span title={stage.tournament_id}>{stage.tournament_id}</span>
            ),
          },
          {
            label: t.sysLastModified,
            value: formatDateTime(stage.updated_at || stage.created_at),
          },
        ]}
      />
    </FicheSection>
  );
}

export default React.memo(MetaInfoCard);
