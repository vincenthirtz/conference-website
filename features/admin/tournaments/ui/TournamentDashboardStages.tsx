// features/admin/tournaments/ui/TournamentDashboardStages.tsx — carte
// « Phases » du hub tournoi : bouton de création et barres de progression.
// La création et le passage à la phase suivante sont des callbacks : la page
// ouvre ses modales, ce composant ne décide rien.

import type nsAdminTournamentOverview from '@/lib/i18n/locales/admin-fr/adminTournamentOverview';
import type { DashboardData } from '@/utils/dashboard/buildTournamentDashboard';
import StageProgressBar from '@/components/admin/dashboard/StageProgressBar';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import TournamentDashboardCard, { DASH_MUTED } from './TournamentDashboardCard';
import type { TournamentDashboardDict } from './TournamentDashboardHeader';

type OverviewDict = typeof nsAdminTournamentOverview.fr;

/** Types de phase proposés par la modale de création. */
export function getStageTypeOptions(tov: OverviewDict) {
  return [
    { value: 'bracket', label: tov.stageTypeBracket },
    { value: 'swiss', label: tov.stageTypeSwiss },
    { value: 'group', label: tov.stageTypeGroupOption },
    { value: 'round_robin', label: tov.stageTypeRoundRobin },
    { value: 'showmatch', label: tov.stageTypeShowmatch },
    { value: 'other', label: tov.stageTypeOther },
  ];
}

export default function TournamentDashboardStages({
  tx,
  tov,
  tournamentId,
  stages,
  readyStageIds,
  onNewStage,
  onAdvance,
}: {
  tx: TournamentDashboardDict;
  tov: OverviewDict;
  tournamentId: string;
  stages: DashboardData['stages'];
  readyStageIds: Set<string>;
  onNewStage: () => void;
  onAdvance: (target: { stageId: string; stageName: string }) => void;
}) {
  return (
    <TournamentDashboardCard
      title={tx.phasesTitle}
      badge={`${stages.length}`}
      ctaHref={`/admin/tournament/${tournamentId}/stages`}
      ctaLabel={tx.manage}
    >
      <div className="mb-3 flex justify-end">
        <AdminButton variant="secondary" size="xs" onClick={onNewStage}>
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
          {tov.newStage}
        </AdminButton>
      </div>
      {stages.length === 0 ? (
        <p className={DASH_MUTED}>{tx.noStages}</p>
      ) : (
        <div className="space-y-2.5">
          {stages.map((st) => (
            <StageProgressBar
              key={st.id}
              stageId={st.id}
              tournamentId={tournamentId}
              name={st.name}
              stageType={st.stage_type}
              totalMatches={st.totalMatches}
              finishedMatches={st.finishedMatches}
              pendingMatches={st.pendingMatches}
              ongoingMatches={st.ongoingMatches}
              isActive={st.is_active}
              teamsCount={st.teamsCount}
              hourlyBuckets={st.hourlyBuckets}
              isReadyToAdvance={readyStageIds.has(st.id)}
              onAdvance={
                readyStageIds.has(st.id)
                  ? () => onAdvance({ stageId: st.id, stageName: st.name })
                  : undefined
              }
            />
          ))}
        </div>
      )}
    </TournamentDashboardCard>
  );
}
