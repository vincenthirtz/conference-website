// components/admin/dashboard/UpcomingMatchRow.tsx
// Ligne compacte pour afficher un match (upcoming, live, en attente) dans le dashboard.

import Link from 'next/link';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminDashboardUpcomingMatchRow from '@/lib/i18n/locales/admin-fr/adminDashboardUpcomingMatchRow';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';

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
  /** Carte en cours (variant=live uniquement). */
  currentMap?: { name: string; type: string | null; index: number } | null;
  /** Format BO du match (utilisé pour l'index "carte X / total"). */
  matchFormat?: string | null;
  /** CTA "Saisir score" inline. Si fourni, remplace la navigation. */
  onScoreClick?: () => void;
  /** CTA "Résoudre" inline pour les disputes. */
  onResolveClick?: () => void;
};

const FORMAT_TOTAL_MAPS: Record<string, number> = {
  bo1: 1,
  bo3: 3,
  bo5: 5,
  bo7: 7,
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
  neutral:
    'border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s2,#1d1520)] hover:border-[var(--or,#b467d1)]',
  live: 'border-[rgba(127,202,101,.55)] bg-[var(--s2,#1d1520)] shadow-[var(--glow-live)]',
  dispute: 'border-[rgba(245,165,36,.38)] bg-[rgba(245,165,36,.06)]',
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
  currentMap,
  matchFormat,
  onScoreClick,
  onResolveClick,
}: Props) {
  const t = useAdminT(nsAdminDashboardUpcomingMatchRow);
  const dayShort = formatDayShort(scheduledAt);
  const time = formatTime(scheduledAt);
  const showScore =
    typeof team1Score === 'number' || typeof team2Score === 'number';

  return (
    <div
      className={`flex items-center gap-3 rounded-[var(--r-ctrl,4px)] border px-3 py-2 transition-colors ${VARIANT[variant]}`}
    >
      <div className="w-14 shrink-0 text-right">
        {variant === 'live' ? (
          <span className="inline-flex items-center gap-1 font-[family-name:var(--fd)] text-[10px] font-bold uppercase tracking-wider text-[var(--lf-200,#b3e7a3)]">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--lf,#7fca65)]" />
            {t.live}
          </span>
        ) : (
          <>
            {dayShort && (
              <div className="text-[9px] uppercase text-[var(--t4,#807984)]">
                {dayShort}
              </div>
            )}
            <div className="text-xs tabular-nums text-[var(--t1,#f4edf7)]">
              {time}
            </div>
          </>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-[var(--t1,#f4edf7)]">
          <span className="font-medium">{team1Name ?? '—'}</span>
          {showScore ? (
            <span className="mx-2 tabular-nums text-[var(--t3,#a39ba6)]">
              {team1Score ?? 0} – {team2Score ?? 0}
            </span>
          ) : (
            <span className="mx-2 text-[var(--t4,#807984)]">vs</span>
          )}
          <span className="font-medium">{team2Name ?? '—'}</span>
          {variant === 'live' && currentMap && (
            <>
              <span className="mx-1.5 text-[var(--t4,#807984)]">·</span>
              <span className="text-[11px] font-medium text-[var(--lf-200,#b3e7a3)]">
                {t.mapLabel} {currentMap.index}
                {matchFormat && FORMAT_TOTAL_MAPS[matchFormat.toLowerCase()]
                  ? `/${FORMAT_TOTAL_MAPS[matchFormat.toLowerCase()]}`
                  : ''}
                {' : '}
                {currentMap.name}
              </span>
            </>
          )}
        </p>
        {(roundName || stageName) && (
          <p className="truncate text-[10px] text-[var(--t3,#a39ba6)]">
            {[stageName, roundName].filter(Boolean).join(' · ')}
            {variant === 'live' && currentMap?.type && (
              <span className="ml-1.5 rounded-[3px] border border-[var(--line2,rgba(194,196,201,.2))] px-1.5 py-0 text-[9px] uppercase tracking-wider text-[var(--t3,#a39ba6)]">
                {currentMap.type}
              </span>
            )}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {streamUrl && (
          <a
            href={streamUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-[30px] items-center rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] px-2.5 font-[family-name:var(--fd)] text-[11px] font-bold uppercase text-[var(--t2,#c7bfca)] hover:border-[var(--t4,#807984)] hover:text-[var(--t1,#f4edf7)]"
            onClick={(e) => e.stopPropagation()}
          >
            {t.stream}
          </a>
        )}
        {onResolveClick && (
          <AdminButton variant="secondary" size="xs" onClick={onResolveClick}>
            {t.resolve}
          </AdminButton>
        )}
        {onScoreClick && (
          <AdminButton variant="secondary" size="xs" onClick={onScoreClick}>
            {t.scoreEntry}
          </AdminButton>
        )}
        <Link
          href={`/admin/matches/${matchId}`}
          className="inline-flex h-[30px] items-center rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] px-2.5 font-[family-name:var(--fd)] text-[11px] font-bold uppercase text-[var(--t2,#c7bfca)] hover:border-[var(--t4,#807984)] hover:text-[var(--t1,#f4edf7)]"
        >
          {t.detail}
        </Link>
      </div>
    </div>
  );
}
