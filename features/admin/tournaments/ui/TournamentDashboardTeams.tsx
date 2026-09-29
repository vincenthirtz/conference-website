// features/admin/tournaments/ui/TournamentDashboardTeams.tsx — carte
// « Équipes » du hub tournoi : ajout unitaire / en masse, compteurs, liste
// triée par seed. Les modales, le chargement et le retrait (confirmé) restent
// dans la page : ce composant ne fait que remonter les clics.

import type nsAdminTournamentOverview from '@/lib/i18n/locales/admin-fr/adminTournamentOverview';
import type { DashboardData } from '@/utils/dashboard/buildTournamentDashboard';
import type { RegistrationField } from '@/utils/registrationFields';
import type { TournamentTeam } from '@/components/admin/tournament/overview/types';
import TeamRow from '@/components/admin/tournament/overview/TeamRow';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import StatTile from '@/features/admin/_shared/ui/StatTile';
import TournamentDashboardCard, { DASH_MUTED } from './TournamentDashboardCard';
import type { TournamentDashboardDict } from './TournamentDashboardHeader';

type OverviewDict = typeof nsAdminTournamentOverview.fr;

export default function TournamentDashboardTeams({
  tx,
  tov,
  summary: s,
  pendingTeamsCount,
  loadingTeams,
  tournamentTeams,
  registrationFields,
  onAdd,
  onBulkAdd,
  onRemove,
}: {
  tx: TournamentDashboardDict;
  tov: OverviewDict;
  summary: DashboardData['summary'];
  pendingTeamsCount: number;
  loadingTeams: boolean;
  tournamentTeams: TournamentTeam[];
  registrationFields: RegistrationField[];
  onAdd: () => void;
  onBulkAdd: () => void;
  onRemove: (tournamentTeamId: string) => void;
}) {
  return (
    <TournamentDashboardCard title={tx.teamsTitle} badge={`${s.totalTeams}`}>
      <div className="mb-3 flex flex-wrap justify-end gap-2">
        <AdminButton variant="secondary" size="xs" onClick={onAdd}>
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          {tov.add}
        </AdminButton>
        <AdminButton size="xs" onClick={onBulkAdd}>
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          {tov.bulkAdd}
        </AdminButton>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label={tx.teamsActive} value={s.activeTeams} tone="ok" />
        <StatTile label={tx.teamsEliminated} value={s.eliminatedTeams} />
        <StatTile
          label={tx.teamsPending}
          value={pendingTeamsCount}
          tone={pendingTeamsCount > 0 ? 'warn' : 'neutral'}
        />
        <StatTile label={tx.teamsTotal} value={s.totalTeams} />
      </div>

      {loadingTeams ? (
        <p className={`py-4 ${DASH_MUTED}`}>{tov.loading}</p>
      ) : tournamentTeams.length === 0 ? (
        <p
          className={`rounded-[var(--r-card,14px)] border border-dashed border-[var(--line2,rgba(194,196,201,.2))] py-6 text-center ${DASH_MUTED}`}
        >
          {tov.noTeams}
        </p>
      ) : (
        <div className="grid max-h-64 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
          {[...tournamentTeams]
            .sort((a, b) => (a.seed ?? 999) - (b.seed ?? 999))
            .map((tt) => (
              <TeamRow
                key={tt.id}
                tt={tt}
                registrationFields={registrationFields}
                onRemove={onRemove}
                tx={tov}
              />
            ))}
        </div>
      )}
    </TournamentDashboardCard>
  );
}
