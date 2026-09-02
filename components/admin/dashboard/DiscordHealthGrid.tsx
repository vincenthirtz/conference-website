// components/admin/dashboard/DiscordHealthGrid.tsx
// Vue compacte de l'état des webhooks Discord par channel_type, pour le dashboard.
// Affiche : configured ✓ / actif / dernière POST + flag "stale" si > 4h sans poster
// alors qu'on attend du trafic.
//
// Sans la migration database/discord_webhook_last_post.sql, lastPostAt est null
// et on dégrade en "config-only" (pas de stale, pas d'horodatage).

import type { DiscordHealth } from '@/utils/dashboard/buildTournamentDashboard';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminDashboardDiscordHealthGrid from '@/lib/i18n/locales/admin-fr/adminDashboardDiscordHealthGrid';

type Dict = typeof nsAdminDashboardDiscordHealthGrid.fr;

type Props = {
  health: DiscordHealth;
  /** ms de référence pour calculer "il y a X" (ticking côté parent). */
  nowMs: number;
};

function getChannelLabel(t: Dict): Record<string, string> {
  return {
    match_announcements: t.channelMatchAnnouncements,
    match_results: t.channelMatchResults,
    bracket_updates: t.channelBracketUpdates,
    veto_live: t.channelVetoLive,
    checkin_reminders: t.channelCheckinReminders,
    support_tickets: t.channelSupportTickets,
    mvp_polls: t.channelMvpPolls,
  };
}

function ageLabel(iso: string | null, nowMs: number, t: Dict): string {
  if (!iso) return '—';
  const ageMs = nowMs - new Date(iso).getTime();
  if (ageMs < 60_000) return t.ageNow;
  if (ageMs < 3_600_000)
    return format(t.ageMinutes, { n: Math.floor(ageMs / 60_000) });
  if (ageMs < 86_400_000)
    return format(t.ageHours, { n: Math.floor(ageMs / 3_600_000) });
  return format(t.ageDays, { n: Math.floor(ageMs / 86_400_000) });
}

export default function DiscordHealthGrid({ health, nowMs }: Props) {
  const t = useAdminT(nsAdminDashboardDiscordHealthGrid);
  const channelLabel = getChannelLabel(t);
  return (
    <div>
      <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {health.channels.map((c) => {
          const status = !c.configured
            ? 'missing'
            : !c.active
              ? 'inactive'
              : c.isStale
                ? 'stale'
                : c.lastPostStatus === 'failed'
                  ? 'failed'
                  : 'ok';

          const styles: Record<typeof status, string> = {
            ok: 'border-emerald-500/20 bg-emerald-500/5 text-emerald-200',
            stale: 'border-amber-500/30 bg-amber-500/10 text-amber-100',
            failed: 'border-red-500/30 bg-red-500/10 text-red-100',
            inactive: 'border-gray-500/20 bg-gray-500/5 text-gray-400',
            missing: 'border-neutral-700 bg-neutral-800/40 text-neutral-500',
          };

          const dot: Record<typeof status, string> = {
            ok: 'bg-emerald-400',
            stale: 'bg-amber-400 animate-pulse',
            failed: 'bg-red-400 animate-pulse',
            inactive: 'bg-gray-500',
            missing: 'bg-neutral-600',
          };

          const tip: Record<typeof status, string> = {
            ok: c.lastPostAt
              ? format(t.tipOkPosted, { age: ageLabel(c.lastPostAt, nowMs, t) })
              : t.tipOkNoHistory,
            stale: c.lastPostAt
              ? format(t.tipStalePosted, {
                  age: ageLabel(c.lastPostAt, nowMs, t),
                })
              : t.tipStaleNoPost,
            failed: t.tipFailed,
            inactive: t.tipInactive,
            missing: t.tipMissing,
          };

          return (
            <li
              key={c.channelType}
              className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-[11px] ${styles[status]}`}
              title={tip[status]}
            >
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot[status]}`}
              />
              <span className="min-w-0 flex-1 truncate font-medium">
                {channelLabel[c.channelType] ?? c.channelType}
              </span>
              <span className="shrink-0 text-[10px] opacity-80">
                {status === 'ok' &&
                  c.lastPostAt &&
                  ageLabel(c.lastPostAt, nowMs, t)}
                {status === 'stale' &&
                  (c.lastPostAt
                    ? ageLabel(c.lastPostAt, nowMs, t)
                    : t.shortSilence)}
                {status === 'failed' && t.shortFailed}
                {status === 'inactive' && 'off'}
                {status === 'missing' && '—'}
              </span>
            </li>
          );
        })}
      </ul>
      {health.missingExpectedCount > 0 && (
        <p className="mt-2 text-[10px] text-amber-300/80">
          {format(t.missingWarning, { count: health.missingExpectedCount })}
        </p>
      )}
    </div>
  );
}
