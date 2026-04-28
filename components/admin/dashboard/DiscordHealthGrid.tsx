// components/admin/dashboard/DiscordHealthGrid.tsx
// Vue compacte de l'état des webhooks Discord par channel_type, pour le dashboard.
// Affiche : configured ✓ / actif / dernière POST + flag "stale" si > 4h sans poster
// alors qu'on attend du trafic.
//
// Sans la migration database/discord_webhook_last_post.sql, lastPostAt est null
// et on dégrade en "config-only" (pas de stale, pas d'horodatage).

import type { DiscordHealth } from '@/utils/dashboard/buildTournamentDashboard';

type Props = {
  health: DiscordHealth;
  /** ms de référence pour calculer "il y a X" (ticking côté parent). */
  nowMs: number;
};

const CHANNEL_LABEL: Record<string, string> = {
  match_announcements: 'Annonces match',
  match_results: 'Résultats',
  bracket_updates: 'Bracket',
  general_announcements: 'Annonces',
  veto_live: 'Veto live',
  checkin_reminders: 'Check-in',
  support_tickets: 'Support',
  mvp_polls: 'MVP polls',
};

function ageLabel(iso: string | null, nowMs: number): string {
  if (!iso) return '—';
  const ageMs = nowMs - new Date(iso).getTime();
  if (ageMs < 60_000) return "à l'instant";
  if (ageMs < 3_600_000) return `il y a ${Math.floor(ageMs / 60_000)} min`;
  if (ageMs < 86_400_000) return `il y a ${Math.floor(ageMs / 3_600_000)}h`;
  return `il y a ${Math.floor(ageMs / 86_400_000)}j`;
}

export default function DiscordHealthGrid({ health, nowMs }: Props) {
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
              ? `Dernière POST ${ageLabel(c.lastPostAt, nowMs)}`
              : 'Configuré et actif (aucun historique encore)',
            stale: c.lastPostAt
              ? `Pas posté depuis ${ageLabel(c.lastPostAt, nowMs)} alors qu'on attend du trafic`
              : "Aucun POST récent alors qu'on attend du trafic",
            failed: 'Le dernier POST a échoué (HTTP non-2xx)',
            inactive: 'Webhook configuré mais désactivé',
            missing: 'Aucun webhook configuré pour ce canal',
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
                {CHANNEL_LABEL[c.channelType] ?? c.channelType}
              </span>
              <span className="shrink-0 text-[10px] opacity-80">
                {status === 'ok' &&
                  c.lastPostAt &&
                  ageLabel(c.lastPostAt, nowMs)}
                {status === 'stale' &&
                  (c.lastPostAt ? ageLabel(c.lastPostAt, nowMs) : 'silence')}
                {status === 'failed' && 'échec'}
                {status === 'inactive' && 'off'}
                {status === 'missing' && '—'}
              </span>
            </li>
          );
        })}
      </ul>
      {health.missingExpectedCount > 0 && (
        <p className="mt-2 text-[10px] text-amber-300/80">
          ⚠️ {health.missingExpectedCount} canal/canaux manquent un webhook
          actif alors qu&apos;on attend du trafic.
        </p>
      )}
    </div>
  );
}
