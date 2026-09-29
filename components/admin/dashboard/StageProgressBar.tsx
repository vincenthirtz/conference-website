// components/admin/dashboard/StageProgressBar.tsx
// Petite barre de progression pour une phase (finished/total) avec label.

import Link from 'next/link';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import Sparkline from './Sparkline';
import Chip from '@/features/admin/_shared/ui/Chip';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import { rubanInset } from '@/features/admin/_shared/ui/ruban';
import nsAdminDashboardStageProgressBar from '@/lib/i18n/locales/admin-fr/adminDashboardStageProgressBar';

type Dict = typeof nsAdminDashboardStageProgressBar.fr;

function getStageTypeLabel(t: Dict): Record<string, string> {
  return {
    group: t.stageTypeGroup,
    bracket: t.stageTypeBracket,
    swiss: t.stageTypeSwiss,
    round_robin: t.stageTypeRoundRobin,
    showmatch: t.stageTypeShowmatch,
  };
}

type Props = {
  stageId: string;
  tournamentId: string;
  name: string;
  stageType: string | null;
  totalMatches: number;
  finishedMatches: number;
  pendingMatches: number;
  ongoingMatches: number;
  isActive: boolean;
  teamsCount: number;
  isReadyToAdvance?: boolean;
  onAdvance?: () => void;
  /** Buckets horaires sur les 12 dernières heures (matchs finis/h). */
  hourlyBuckets?: number[];
};

export default function StageProgressBar({
  stageId,
  tournamentId,
  name,
  stageType,
  totalMatches,
  finishedMatches,
  ongoingMatches,
  isActive,
  teamsCount,
  isReadyToAdvance,
  onAdvance,
  hourlyBuckets,
}: Props) {
  const t = useAdminT(nsAdminDashboardStageProgressBar);
  const stageTypeLabel = getStageTypeLabel(t);
  const percent =
    totalMatches > 0 ? Math.round((finishedMatches / totalMatches) * 100) : 0;
  const remaining = totalMatches - finishedMatches;
  const typeLabel = stageType ? (stageTypeLabel[stageType] ?? stageType) : null;

  return (
    <div className={`${rubanInset} p-3`}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--t1,#f4edf7)]">
            {name}
            {!isActive && (
              <span className="ml-2 align-middle">
                <Chip tone="neutral">inactive</Chip>
              </span>
            )}
            {isReadyToAdvance && (
              <span className="ml-2 align-middle">
                <Chip tone="ok">ready</Chip>
              </span>
            )}
          </p>
          <p className="text-[10px] text-[var(--t3,#a39ba6)]">
            {typeLabel ?? '—'} ·{' '}
            {format(teamsCount > 1 ? t.teamsCount_other : t.teamsCount_one, {
              count: teamsCount,
            })}
            {ongoingMatches > 0 && (
              <span className="ml-1 text-[var(--lf-200,#b3e7a3)]">
                {' '}
                {format(t.ongoingSuffix, { count: ongoingMatches })}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs tabular-nums text-[var(--t2,#c7bfca)]">
            {finishedMatches}/{totalMatches}
          </span>
          {isReadyToAdvance && onAdvance && (
            <AdminButton
              variant="secondary"
              size="xs"
              onClick={onAdvance}
              title={t.advanceTitle}
            >
              {t.advance}
            </AdminButton>
          )}
          <Link
            href={`/admin/tournament/${tournamentId}/matches?stageId=${stageId}`}
            className="text-[10px] text-[var(--or-200,#eec4ff)] hover:text-[var(--t1,#f4edf7)]"
          >
            {t.view}
          </Link>
        </div>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--s3,#2f2732)]">
        <div
          className={`h-full transition-all ${
            percent === 100
              ? 'bg-[var(--lf,#7fca65)]'
              : 'bg-[var(--or,#b467d1)]'
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="mt-1.5 flex items-end justify-between gap-2">
        {remaining > 0 ? (
          <p className="text-[10px] text-[var(--t3,#a39ba6)]">
            {format(remaining > 1 ? t.remaining_other : t.remaining_one, {
              count: remaining,
            })}
          </p>
        ) : (
          <span />
        )}
        {hourlyBuckets && hourlyBuckets.some((v) => v > 0) && (
          <div
            className="flex items-center gap-1.5"
            title={format(t.cadenceTitle, { values: hourlyBuckets.join(', ') })}
          >
            <span className="text-[9px] uppercase tracking-wider text-[var(--t4,#807984)]">
              12h
            </span>
            <Sparkline
              values={hourlyBuckets}
              width={72}
              height={20}
              className={
                percent === 100
                  ? 'text-[var(--lf-200,#b3e7a3)]'
                  : 'text-[var(--or-300,#dea3f6)]'
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}
