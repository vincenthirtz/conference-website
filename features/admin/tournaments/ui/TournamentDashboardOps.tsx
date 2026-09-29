// features/admin/tournaments/ui/TournamentDashboardOps.tsx — les cartes
// d'exploitation du hub tournoi : check-in des prochaines 24 h, activité
// staff récente, tickets support, webhooks Discord et battement du cron de
// check-in. Purement présentationnel : tout arrive calculé dans `sig`, l'âge
// des lignes est dérivé de l'horloge `nowMs` que porte la page.

import { format } from '@/lib/i18n/useAdminT';
import type { DashboardSignals } from '@/utils/dashboard/buildTournamentDashboard';
import SupportTicketsDonut from '@/components/admin/dashboard/SupportTicketsDonut';
import DiscordHealthGrid from '@/components/admin/dashboard/DiscordHealthGrid';
import Chip from '@/features/admin/_shared/ui/Chip';
import StatTile from '@/features/admin/_shared/ui/StatTile';
import TournamentDashboardCard, { DASH_MUTED } from './TournamentDashboardCard';
import type { TournamentDashboardDict } from './TournamentDashboardHeader';

type Common = {
  tx: TournamentDashboardDict;
  sig: DashboardSignals;
};

export function TournamentDashboardCheckin({
  tx,
  sig,
  tournamentId,
}: Common & { tournamentId: string | undefined }) {
  const c = sig.checkinNext24h;
  return (
    <TournamentDashboardCard
      title={tx.checkinTitle}
      ctaHref={`/admin/tournament/${tournamentId}/checkin`}
      ctaLabel={tx.detail}
    >
      {c.upcoming === 0 ? (
        <p className={DASH_MUTED}>{tx.noMatchIn24h}</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile label={tx.checkinOk} value={c.bothCheckedIn} tone="ok" />
          <StatTile
            label={tx.checkinPartial}
            value={c.oneSide}
            tone={c.oneSide > 0 ? 'warn' : 'neutral'}
          />
          <StatTile
            label={tx.checkinNone}
            value={c.missing}
            tone={c.missing > 0 ? 'err' : 'neutral'}
          />
          <StatTile label={tx.checkinForfeit} value={c.forfeited} />
        </div>
      )}
    </TournamentDashboardCard>
  );
}

export function TournamentDashboardActivity({
  tx,
  sig,
  tournamentId,
  nowMs,
}: Common & { tournamentId: string | undefined; nowMs: number }) {
  return (
    <TournamentDashboardCard
      title={tx.recentActivityTitle}
      badge={sig.recentActivity.length}
      ctaHref={`/admin/tournament/${tournamentId}/history`}
      ctaLabel={tx.allHistory}
    >
      {sig.recentActivity.length === 0 ? (
        <p className={DASH_MUTED}>{tx.noStaffAction}</p>
      ) : (
        <ul className="space-y-2">
          {sig.recentActivity.map((row) => {
            const ageMs = nowMs - new Date(row.createdAt).getTime();
            const ageLabel =
              ageMs < 60_000
                ? tx.ageNow
                : ageMs < 3_600_000
                  ? format(tx.ageMinutes, { n: Math.floor(ageMs / 60_000) })
                  : ageMs < 86_400_000
                    ? format(tx.ageHours, {
                        n: Math.floor(ageMs / 3_600_000),
                      })
                    : format(tx.ageDays, {
                        n: Math.floor(ageMs / 86_400_000),
                      });
            return (
              <li
                key={row.id}
                className="flex items-start gap-2 rounded-[var(--r-ctrl,4px)] border border-[var(--line,rgba(194,196,201,.1))] bg-[var(--s2,#1d1520)] px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-[var(--t1,#f4edf7)]">
                    <span className="font-medium text-[var(--or-300,#dea3f6)]">
                      {row.staffName ?? tx.defaultStaffName}
                    </span>
                    <span className="mx-1.5 text-[var(--t4,#807984)]">·</span>
                    <span>{row.readableAction}</span>
                    {row.entityType && (
                      <span className="ml-1.5 text-[var(--t3,#a39ba6)]">
                        ({row.entityType}
                        {row.entityId ? ` ${row.entityId.slice(0, 8)}` : ''})
                      </span>
                    )}
                  </p>
                </div>
                <span
                  className="shrink-0 text-[11px] text-[var(--t3,#a39ba6)]"
                  data-numeric
                >
                  {ageLabel}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </TournamentDashboardCard>
  );
}

export function TournamentDashboardHealth({
  tx,
  sig,
  tournamentId,
  nowMs,
}: Common & { tournamentId: string | undefined; nowMs: number }) {
  const cron = sig.cronCheckin;
  return (
    <>
      <TournamentDashboardCard
        title={tx.supportTicketsTitle}
        badge={sig.tickets.totalOpen > 0 ? sig.tickets.totalOpen : undefined}
        ctaHref={`/admin/moderation?tab=support&tournament_id=${tournamentId}&status=open`}
        ctaLabel={tx.open}
      >
        <SupportTicketsDonut tickets={sig.tickets} />
      </TournamentDashboardCard>

      <TournamentDashboardCard
        title={tx.webhooksTitle}
        badge={
          sig.discordHealth.configuredCount > 0
            ? `${sig.discordHealth.configuredCount}/${sig.discordHealth.channels.length}`
            : undefined
        }
        ctaHref={`/admin/tournament/${tournamentId}/discord`}
        ctaLabel={tx.configure}
      >
        <DiscordHealthGrid health={sig.discordHealth} nowMs={nowMs} />
      </TournamentDashboardCard>

      <TournamentDashboardCard title={tx.cronTitle}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p
              className={`text-sm font-semibold ${
                cron.isStale
                  ? 'text-[var(--err,#ff6b6b)]'
                  : cron.lastRunAt
                    ? 'text-[var(--lf,#7fca65)]'
                    : 'text-[var(--t3,#a39ba6)]'
              }`}
            >
              {cron.lastRunAt
                ? cron.minutesSince === 0
                  ? tx.cronNow
                  : cron.minutesSince! < 60
                    ? format(tx.ageMinutes, { n: cron.minutesSince ?? 0 })
                    : format(tx.ageHours, {
                        n: Math.floor(cron.minutesSince! / 60),
                      })
                : tx.cronNever}
            </p>
            <p className="mt-0.5 text-[11px] text-[var(--t3,#a39ba6)]">
              {cron.isStale ? tx.cronStaleHint : tx.cronOkHint}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            {(cron.isStale || cron.lastRunAt) && (
              <Chip tone={cron.isStale ? 'err' : 'ok'}>
                {cron.isStale ? '⚠' : 'OK'}
              </Chip>
            )}
            {cron.lastRunAt && (
              <span
                className="text-[11px] text-[var(--t3,#a39ba6)] tabular-nums"
                data-numeric
              >
                {new Date(cron.lastRunAt).toLocaleTimeString('fr-FR')}
              </span>
            )}
          </div>
        </div>
      </TournamentDashboardCard>
    </>
  );
}
