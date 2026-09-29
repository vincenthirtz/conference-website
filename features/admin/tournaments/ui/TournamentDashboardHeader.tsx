// features/admin/tournaments/ui/TournamentDashboardHeader.tsx — en-tête du hub
// tournoi : nom, statut (Chip), matchs en direct (Chip live), fraîcheur des
// données, export et rafraîchissement. Purement présentationnel : le
// rafraîchissement est une callback de la page.

import { tournamentUrls } from '../client';
import type nsAdminTournamentDashboard from '@/lib/i18n/locales/admin-fr/adminTournamentDashboard';
import { format } from '@/lib/i18n/useAdminT';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import AdminPageHeader from '@/features/admin/_shared/ui/AdminPageHeader';
import Chip, { type ChipTone } from '@/features/admin/_shared/ui/Chip';
import { DASH_PULSE_DOT } from './TournamentDashboardCard';

export type TournamentDashboardDict = typeof nsAdminTournamentDashboard.fr;

/** Ton de la puce de statut du tournoi — la couleur signale, elle ne décore pas. */
export const TOURNAMENT_STATUS_TONE: Record<string, ChipTone> = {
  draft: 'neutral',
  published: 'brand',
  running: 'ok',
  completed: 'ok',
  archived: 'neutral',
};

export function getTournamentStatusLabels(
  tx: TournamentDashboardDict
): Record<string, string> {
  return {
    draft: tx.statusDraft,
    published: tx.statusPublished,
    running: tx.statusRunning,
    completed: tx.statusCompleted,
    archived: tx.statusArchived,
  };
}

/** « J-3 » / « 5h » avant `iso` ; null si passé ou absent. */
export function jDayLabel(iso: string | null, now: Date): string | null {
  if (!iso) return null;
  try {
    const target = new Date(iso);
    const diffMs = target.getTime() - now.getTime();
    if (diffMs <= 0) return null;
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (days >= 1) return `J-${days}`;
    const hours = Math.ceil(diffMs / (1000 * 60 * 60));
    return `${hours}h`;
  } catch {
    return null;
  }
}

const MENU_ITEM =
  'block px-4 py-2 text-sm text-[var(--t2,#c7bfca)] transition-colors hover:bg-[var(--s3,#2f2732)] hover:text-[var(--t1,#f4edf7)]';

export default function TournamentDashboardHeader({
  tx,
  tournamentId,
  name,
  status,
  statusLabels,
  liveCount,
  jDayHeader,
  lastFetchedAt,
  stale,
  onRefresh,
}: {
  tx: TournamentDashboardDict;
  tournamentId: string | undefined;
  name: string | undefined;
  status: string | null | undefined;
  statusLabels: Record<string, string>;
  liveCount: number;
  jDayHeader: string | null;
  lastFetchedAt: Date | null;
  stale: boolean;
  onRefresh: () => void;
}) {
  return (
    <AdminPageHeader
      title={name ?? tx.loadingName}
      badge={
        <>
          {status && (
            <Chip tone={TOURNAMENT_STATUS_TONE[status] ?? 'neutral'}>
              {statusLabels[status] ?? status}
            </Chip>
          )}
          {liveCount > 0 && (
            <Chip tone="live">
              <span
                className={`${DASH_PULSE_DOT} bg-[var(--lf,#7fca65)]`}
                aria-hidden
              />
              {format(tx.liveCount, { count: liveCount })}
            </Chip>
          )}
        </>
      }
      subtitle={
        <>
          {tx.controlCenter}
          {jDayHeader && (
            <>
              {tx.nextKickoffBefore}
              <span className="text-[var(--or-300,#dea3f6)]">{jDayHeader}</span>
            </>
          )}
          {lastFetchedAt && (
            <>
              {' · '}
              <span
                className={
                  stale
                    ? 'text-[var(--warn,#f5a524)]'
                    : 'text-[var(--t3,#a39ba6)]'
                }
              >
                {stale ? tx.stale : tx.upToDate} ·{' '}
                {lastFetchedAt.toLocaleTimeString('fr-FR')}
              </span>
            </>
          )}
        </>
      }
      actions={
        <>
          <div className="group relative">
            <AdminButton size="sm">
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              {tx.export}
            </AdminButton>
            <div className="invisible absolute right-0 z-10 mt-1 w-48 rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] py-1 shadow-lg group-focus-within:visible group-hover:visible">
              <a
                href={tournamentUrls.exportResults(String(tournamentId), 'csv')}
                className={MENU_ITEM}
              >
                {tx.resultsCsv}
              </a>
              <a
                href={tournamentUrls.exportResults(
                  String(tournamentId),
                  'json'
                )}
                className={MENU_ITEM}
              >
                {tx.resultsJson}
              </a>
            </div>
          </div>
          <AdminButton size="sm" onClick={onRefresh}>
            {tx.refresh}
          </AdminButton>
        </>
      }
    />
  );
}
