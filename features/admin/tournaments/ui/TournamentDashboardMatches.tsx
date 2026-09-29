// features/admin/tournaments/ui/TournamentDashboardMatches.tsx — colonne
// « matchs » du hub tournoi : en direct, à venir, litiges ouverts. La saisie
// de score et l'arbitrage sont des callbacks : la page ouvre ses modales.

import type {
  DashboardData,
  DashboardSignals,
} from '@/utils/dashboard/buildTournamentDashboard';
import UpcomingMatchRow from '@/components/admin/dashboard/UpcomingMatchRow';
import TournamentDashboardCard, {
  DASH_MUTED,
  DASH_PULSE_DOT,
} from './TournamentDashboardCard';
import type { TournamentDashboardDict } from './TournamentDashboardHeader';

/** Match visé par la modale de score ou d'arbitrage. */
export type DashboardMatchTarget = {
  id: string;
  team1Name: string | null;
  team2Name: string | null;
  team1Score?: number | null;
  team2Score?: number | null;
  matchFormat?: string | null;
};

export default function TournamentDashboardMatches({
  tx,
  sig,
  upcomingMatches,
  tournamentId,
  onScore,
  onResolve,
}: {
  tx: TournamentDashboardDict;
  sig: DashboardSignals;
  upcomingMatches: DashboardData['upcomingMatches'];
  tournamentId: string | undefined;
  onScore: (target: DashboardMatchTarget) => void;
  onResolve: (target: DashboardMatchTarget & { reason: string | null }) => void;
}) {
  return (
    <>
      {sig.liveMatches.length > 0 && (
        <TournamentDashboardCard
          title={tx.liveTitle}
          badge={
            <>
              <span
                className={`${DASH_PULSE_DOT} bg-[var(--lf,#7fca65)]`}
                aria-hidden
              />
              {sig.liveMatches.length}
            </>
          }
          tone="live"
        >
          <div className="space-y-2">
            {sig.liveMatches.slice(0, 5).map((m) => (
              <UpcomingMatchRow
                key={m.id}
                matchId={m.id}
                team1Name={m.team1Name}
                team2Name={m.team2Name}
                scheduledAt={m.scheduledAt}
                team1Score={m.team1Score}
                team2Score={m.team2Score}
                streamUrl={m.streamUrl}
                roundName={m.roundName}
                stageName={m.stageName}
                variant="live"
                currentMap={m.currentMap}
                matchFormat={m.matchFormat}
                onScoreClick={() =>
                  onScore({
                    id: m.id,
                    team1Name: m.team1Name,
                    team2Name: m.team2Name,
                    team1Score: m.team1Score,
                    team2Score: m.team2Score,
                    matchFormat: m.matchFormat,
                  })
                }
              />
            ))}
          </div>
        </TournamentDashboardCard>
      )}

      <TournamentDashboardCard
        title={tx.upcomingTitle}
        badge={upcomingMatches.length}
        ctaHref={`/admin/tournament/${tournamentId}/matches?status=pending`}
        ctaLabel={tx.seeAll}
      >
        {upcomingMatches.length === 0 ? (
          <p className={DASH_MUTED}>{tx.noUpcoming}</p>
        ) : (
          <div className="space-y-2">
            {upcomingMatches.slice(0, 8).map((m) => (
              <UpcomingMatchRow
                key={m.id}
                matchId={m.id}
                team1Name={m.team1_name}
                team2Name={m.team2_name}
                scheduledAt={m.scheduled_at}
                streamUrl={m.stream_url}
                roundName={m.round_name}
                stageName={m.stage_name}
                onScoreClick={() =>
                  onScore({
                    id: m.id,
                    team1Name: m.team1_name,
                    team2Name: m.team2_name,
                  })
                }
              />
            ))}
          </div>
        )}
      </TournamentDashboardCard>

      {sig.disputesOpen.count > 0 && (
        <TournamentDashboardCard
          title={tx.disputesTitle}
          badge={sig.disputesOpen.count}
          ctaHref={`/admin/tournament/${tournamentId}/matches?status=disputed`}
          ctaLabel={tx.allFem}
          tone="err"
        >
          <div className="space-y-2">
            {sig.disputesOpen.matches.slice(0, 5).map((m) => (
              <UpcomingMatchRow
                key={m.id}
                matchId={m.id}
                team1Name={m.team1Name}
                team2Name={m.team2Name}
                scheduledAt={m.openedAt}
                roundName={m.reason ? m.reason.slice(0, 60) : null}
                variant="dispute"
                onResolveClick={() =>
                  onResolve({
                    id: m.id,
                    team1Name: m.team1Name,
                    team2Name: m.team2Name,
                    reason: m.reason,
                  })
                }
              />
            ))}
          </div>
        </TournamentDashboardCard>
      )}
    </>
  );
}
