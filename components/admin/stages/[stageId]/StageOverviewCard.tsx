// components/admin/stages/[stageId]/StageOverviewCard.tsx
import React from 'react';
import type { Stage } from '@/types/admin';
import {
  CARD,
  CARD_TITLE,
  EYEBROW,
  TILE,
} from '@/features/admin/stages/ui/rubanClasses';
import { type Dict, formatDateTime, stageTypeLabel } from './stageDisplay';

type Props = {
  stage: Stage;
  t: Dict;
};

/** Carte « Informations » (type, ordre, statut, dates). Purement dérivée de `stage`. */
function StageOverviewCard({ stage, t }: Props) {
  const items: { label: string; value: string; small?: boolean }[] = [
    { label: t.infoType, value: stageTypeLabel(stage.stage_type, t) },
    {
      label: t.infoOrder,
      value: stage.order_index !== null ? `#${stage.order_index + 1}` : '—',
    },
    {
      label: t.infoStatus,
      value: stage.is_active ? t.statusActive : t.statusInactive,
    },
    {
      label: t.infoStartDate,
      value: formatDateTime(stage.start_date),
      small: true,
    },
    {
      label: t.infoEndDate,
      value: formatDateTime(stage.end_date),
      small: true,
    },
    {
      label: t.infoCreatedAt,
      value: formatDateTime(stage.created_at),
      small: true,
    },
  ];
  return (
    <section className={CARD}>
      <h2 className={`${CARD_TITLE} mb-4`}>{t.infoTitle}</h2>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {items.map((item) => (
          <div key={item.label} className={`${TILE} p-4`}>
            <div className={`${EYEBROW} mb-1.5`}>{item.label}</div>
            <div
              className={`font-medium text-[var(--t1,#f4edf7)] ${item.small ? 'font-mono text-sm' : ''}`}
            >
              {item.value}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default React.memo(StageOverviewCard);
