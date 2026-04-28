// components/admin/dashboard/UpcomingMatchRow.tsx
// Ligne compacte pour afficher un match (upcoming, live, en attente) dans le dashboard.

import Link from 'next/link';

type Props = {
  matchId: string;
  team1Name: string | null;
  team2Name: string | null;
  scheduledAt: string | null;
  team1Score?: number | null;
  team2Score?: number | null;
  streamUrl?: string | null;
  roundName?: string | null;
  stageName?: string | null;
  /** Variant visuelle : neutral (default), live, dispute */
  variant?: 'neutral' | 'live' | 'dispute';
};

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Paris',
    });
  } catch {
    return '—';
  }
}

function formatDayShort(iso: string | null): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    const today = new Date();
    if (
      d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear()
    ) {
      return null; // omit "today"
    }
    return d.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
    });
  } catch {
    return null;
  }
}

const VARIANT: Record<NonNullable<Props['variant']>, string> = {
  neutral: 'border-white/8 hover:border-purple-500/30',
  live: 'border-rose-500/30 bg-rose-500/[0.04]',
  dispute: 'border-amber-500/30 bg-amber-500/[0.04]',
};

export default function UpcomingMatchRow({
  matchId,
  team1Name,
  team2Name,
  scheduledAt,
  team1Score,
  team2Score,
  streamUrl,
  roundName,
  stageName,
  variant = 'neutral',
}: Props) {
  const dayShort = formatDayShort(scheduledAt);
  const time = formatTime(scheduledAt);
  const showScore =
    typeof team1Score === 'number' || typeof team2Score === 'number';

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border bg-white/[0.02] px-3 py-2 transition-colors ${VARIANT[variant]}`}
    >
      <div className="w-14 shrink-0 text-right">
        {variant === 'live' ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-rose-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400" />
            Live
          </span>
        ) : (
          <>
            {dayShort && (
              <div className="text-[9px] uppercase text-gray-500">
                {dayShort}
              </div>
            )}
            <div className="text-xs tabular-nums text-gray-200">{time}</div>
          </>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-white">
          <span className="font-medium">{team1Name ?? '—'}</span>
          {showScore ? (
            <span className="mx-2 tabular-nums text-gray-400">
              {team1Score ?? 0} – {team2Score ?? 0}
            </span>
          ) : (
            <span className="mx-2 text-gray-500">vs</span>
          )}
          <span className="font-medium">{team2Name ?? '—'}</span>
        </p>
        {(roundName || stageName) && (
          <p className="truncate text-[10px] text-gray-500">
            {[stageName, roundName].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {streamUrl && (
          <a
            href={streamUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md bg-purple-500/15 px-2 py-1 text-[10px] font-medium text-purple-200 hover:bg-purple-500/25"
            onClick={(e) => e.stopPropagation()}
          >
            Stream
          </a>
        )}
        <Link
          href={`/admin/matches/${matchId}`}
          className="rounded-md border border-white/10 px-2 py-1 text-[10px] text-gray-300 hover:bg-white/5"
        >
          Détail
        </Link>
      </div>
    </div>
  );
}
