// features/admin/tournaments/ui/TournamentDashboardKpis.tsx — la rangée de
// chiffres du hub tournoi (équipes, matchs, en cours, phases, cadence, ETA,
// dates). Purement présentationnel : l'ETA « vivante » est calculée par la
// page, qui porte l'horloge.

import { format } from '@/lib/i18n/useAdminT';
import { formatDateTimeTz, formatDateTz } from '@/utils/timezone';
import StatTile from '@/features/admin/_shared/ui/StatTile';
// `import type` : le module source touche `supabaseAdmin` (voir
// components/admin/dashboard/TournamentAlerts.tsx).
import type { DashboardData } from '@/utils/dashboard/buildTournamentDashboard';
import type { TournamentDashboardDict } from './TournamentDashboardHeader';

export type LiveEta = { label: string; iso: string } | null;

/**
 * ETA de fin du tournoi, recalculée depuis `nowMs` : le libellé se rafraîchit
 * (« dans 2 h » → « dans 1 h ») sans nouveau chargement.
 */
export function computeLiveEta(
  etaIso: string | null | undefined,
  nowMs: number,
  tx: TournamentDashboardDict
): LiveEta {
  if (!etaIso) return null;
  const diffMs = new Date(etaIso).getTime() - nowMs;
  if (diffMs <= 0) return { label: tx.etaImminent, iso: etaIso };
  const hours = Math.round(diffMs / 3_600_000);
  if (hours < 1) {
    const minutes = Math.round(diffMs / 60_000);
    return { label: format(tx.etaInMinutes, { n: minutes }), iso: etaIso };
  }
  if (hours < 36)
    return { label: format(tx.etaInHours, { n: hours }), iso: etaIso };
  const days = Math.round(hours / 24);
  return { label: format(tx.etaInDays, { n: days }), iso: etaIso };
}

export default function TournamentDashboardKpis({
  tx,
  tournament: t,
  summary: s,
  stages,
  velocity,
  liveEta,
}: {
  tx: TournamentDashboardDict;
  tournament: DashboardData['tournament'];
  summary: DashboardData['summary'];
  stages: DashboardData['stages'];
  velocity: DashboardData['signals']['velocity'];
  liveEta: LiveEta;
}) {
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      <StatTile
        label={tx.kpiTeams}
        value={`${s.totalTeams}/${t.max_teams ?? '∞'}`}
        hint={format(tx.kpiTeamsEliminated, { count: s.eliminatedTeams })}
      />
      <StatTile
        label={tx.kpiMatches}
        value={`${s.finishedMatches}/${s.totalMatches}`}
        hint={format(tx.kpiMatchesDone, { percent: s.completionPercent })}
        tone="brand"
      />
      <StatTile
        label={tx.kpiOngoing}
        value={s.ongoingMatches}
        hint={s.ongoingMatches > 0 ? tx.kpiLive : '—'}
        tone={s.ongoingMatches > 0 ? 'ok' : 'neutral'}
      />
      <StatTile
        label={tx.kpiStages}
        value={stages.length}
        hint={stages.find((st) => st.is_active)?.name ?? tx.kpiNoActiveStage}
      />
      <StatTile
        label={tx.kpiCadence}
        value={
          velocity.matchesPerHour > 0 ? `${velocity.matchesPerHour}/h` : '—'
        }
        hint={
          velocity.finishedInWindow > 0
            ? format(tx.kpiCadenceHint, {
                count: velocity.finishedInWindow,
                hours: velocity.windowHours,
              })
            : tx.kpiNoRecentActivity
        }
        tone={velocity.matchesPerHour > 0 ? 'ok' : 'neutral'}
      />
      <StatTile
        label={tx.kpiEta}
        value={
          liveEta?.label ??
          (velocity.remainingMatches === 0 ? tx.kpiCompleted : '—')
        }
        hint={
          liveEta?.iso
            ? formatDateTimeTz(liveEta.iso, t.timezone, {
                dateStyle: 'medium',
                timeStyle: 'short',
              })
            : velocity.remainingMatches === 0
              ? tx.kpiAllPlayed
              : tx.kpiCadenceTooLow
        }
        tone={liveEta ? 'brand' : 'neutral'}
      />
      <StatTile
        label={tx.kpiStart}
        value={t.start_date ? formatDateTz(t.start_date, t.timezone) : '—'}
      />
      <StatTile
        label={tx.kpiEnd}
        value={t.end_date ? formatDateTz(t.end_date, t.timezone) : '—'}
      />
    </div>
  );
}
