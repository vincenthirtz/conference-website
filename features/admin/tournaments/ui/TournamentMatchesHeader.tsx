// features/admin/tournaments/ui/TournamentMatchesHeader.tsx — en-tête de
// l'écran « matchs du tournoi » : titre, ligne chiffrée (tournoi, slug,
// fuseau, nombre de matchs) et actions (PDF, auto-scheduler, import CSV,
// opérations groupées). Présentationnel : l'auto-scheduler et le panneau CSV
// sont pilotés par la page.

import { format } from '@/lib/i18n/useAdminT';
import PrintExportButton from '@/components/PrintExportButton';
import AdminPageHeader from '@/features/admin/_shared/ui/AdminPageHeader';
import AdminButton, {
  AdminButtonLink,
} from '@/features/admin/_shared/ui/AdminButton';
import type { TournamentMatchesDict } from './TournamentMatchesShared';

export default function TournamentMatchesHeader({
  t,
  tournament,
  timezone,
  total,
  tournamentId,
  autoSchedRunning,
  onAutoSchedule,
  csvImportMode,
  onToggleCsvImport,
}: {
  t: TournamentMatchesDict;
  tournament: { name: string; slug?: string | null } | null;
  timezone: string;
  total: number | null;
  tournamentId: string | string[] | undefined;
  autoSchedRunning: boolean;
  onAutoSchedule: () => void;
  csvImportMode: boolean;
  onToggleCsvImport: () => void;
}) {
  return (
    <AdminPageHeader
      title={t.heading}
      subtitle={
        tournament && (
          <>
            {tournament.name}
            {tournament.slug && (
              <span className="ml-2 rounded-[3px] bg-[var(--s2,#1d1520)] px-2 py-0.5 font-mono text-xs text-[var(--t4,#807984)]">
                /{tournament.slug}
              </span>
            )}
            <span className="ml-2 text-xs text-[var(--t4,#807984)]">
              {timezone}
            </span>
            {total !== null && (
              <span className="ml-2">
                {format(total > 1 ? t.matchCount_other : t.matchCount_one, {
                  count: total,
                })}
              </span>
            )}
          </>
        )
      }
      actions={
        <div className="flex flex-wrap items-center gap-2.5 print:hidden">
          <PrintExportButton variant="admin" />
          <AdminButton
            variant="secondary"
            onClick={onAutoSchedule}
            disabled={autoSchedRunning}
          >
            {autoSchedRunning ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                {t.planningInProgress}
              </>
            ) : (
              <>
                <svg
                  aria-hidden
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                {t.autoScheduler}
              </>
            )}
          </AdminButton>

          <AdminButton
            variant={csvImportMode ? 'secondary' : 'ghost'}
            aria-pressed={csvImportMode}
            onClick={onToggleCsvImport}
          >
            <svg
              aria-hidden
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
              />
            </svg>
            {t.importCsv}
          </AdminButton>

          <AdminButtonLink
            href={`/admin/tournament/${tournamentId}/bulk-ops`}
            variant="ghost"
            title={t.bulkOpsTitle}
          >
            {t.bulkOps}
          </AdminButtonLink>
        </div>
      }
    />
  );
}
