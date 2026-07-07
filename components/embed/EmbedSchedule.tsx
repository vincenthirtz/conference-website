// components/embed/EmbedSchedule.tsx
// Chrome-less, theme-aware match schedule for the iframe-embeddable read-only
// tournament schedule page. Mirrors EmbedBracket: no Navbar/Footer/Toast, a
// discreet "view on site" link, i18n via useT('embedSchedule'). Renders only
// the public, non-PII fields exposed by PublicMatch (team names, scores,
// status, schedule). Dates localized with 'fr-FR' (embed defaults to FR).

import type { PublicMatch } from '@/utils/public/readMatches';
import { useT, format } from '@/lib/i18n/useT';

export type EmbedTheme = 'light' | 'dark';

const LOCALE = 'fr-FR';

type EmbedScheduleProps = {
  tournamentName: string;
  matches: PublicMatch[];
  theme: EmbedTheme;
  /** Optional canonical public URL for a discreet "view on site" link. */
  publicUrl?: string | null;
  siteLabel?: string;
};

type MatchStatusKind = 'upcoming' | 'live' | 'done';

function statusKind(status: string): MatchStatusKind {
  if (status === 'ongoing') return 'live';
  if (status === 'finished') return 'done';
  return 'upcoming';
}

/** Group matches by calendar day (in the viewer's locale). Undated last. */
function groupByDay(
  matches: PublicMatch[]
): Array<{ key: string; label: string; items: PublicMatch[] }> {
  const groups = new Map<string, { label: string; items: PublicMatch[] }>();
  for (const m of matches) {
    const key = m.scheduled_at
      ? new Date(m.scheduled_at).toISOString().slice(0, 10)
      : '__undated__';
    const label = m.scheduled_at
      ? new Date(m.scheduled_at).toLocaleDateString(LOCALE, {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })
      : '';
    if (!groups.has(key)) groups.set(key, { label, items: [] });
    groups.get(key)!.items.push(m);
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => {
      if (a === '__undated__') return 1;
      if (b === '__undated__') return -1;
      return a < b ? -1 : a > b ? 1 : 0;
    })
    .map(([key, g]) => ({ key, label: g.label, items: g.items }));
}

function formatTime(scheduledAt: string | null): string {
  if (!scheduledAt) return '';
  return new Date(scheduledAt).toLocaleTimeString(LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function EmbedSchedule({
  tournamentName,
  matches,
  theme,
  publicUrl,
  siteLabel = 'le site',
}: EmbedScheduleProps) {
  const t = useT('embedSchedule');
  const isLight = theme === 'light';

  const statusLabel: Record<MatchStatusKind, string> = {
    upcoming: t.statusUpcoming,
    live: t.statusLive,
    done: t.statusDone,
  };

  function statusPillClass(kind: MatchStatusKind): string {
    if (kind === 'live') {
      return isLight
        ? 'bg-rose-100 text-rose-700'
        : 'bg-rose-500/20 text-rose-300';
    }
    if (kind === 'done') {
      return isLight
        ? 'bg-neutral-200 text-neutral-600'
        : 'bg-white/10 text-neutral-300';
    }
    return isLight
      ? 'bg-purple-100 text-purple-700'
      : 'bg-purple-500/20 text-purple-300';
  }

  const groups = groupByDay(matches);

  return (
    <div
      className={
        isLight
          ? 'min-h-screen w-full bg-neutral-100 text-neutral-900'
          : 'min-h-screen w-full bg-neutral-950 text-white'
      }
    >
      <div className="mx-auto max-w-[900px] px-3 py-4 sm:px-5 sm:py-6">
        <header className="mb-4 flex items-baseline justify-between gap-3">
          <h1
            className={
              isLight
                ? 'text-base font-semibold text-neutral-900 sm:text-lg'
                : 'text-base font-semibold text-white sm:text-lg'
            }
          >
            {tournamentName}
          </h1>
          {publicUrl && (
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={
                isLight
                  ? 'shrink-0 text-[11px] text-neutral-500 underline-offset-2 hover:underline'
                  : 'shrink-0 text-[11px] text-neutral-400 underline-offset-2 hover:underline'
              }
            >
              {format(t.viewOn, { site: siteLabel })} ↗
            </a>
          )}
        </header>

        {matches.length === 0 ? (
          <p
            className={
              isLight
                ? 'rounded-lg border border-neutral-300 bg-white px-4 py-6 text-center text-sm text-neutral-500'
                : 'rounded-lg border border-white/10 bg-white/5 px-4 py-6 text-center text-sm text-neutral-400'
            }
          >
            {t.empty}
          </p>
        ) : (
          <div className="space-y-5">
            {groups.map((group) => (
              <section key={group.key}>
                {group.label && (
                  <h2
                    className={
                      isLight
                        ? 'mb-2 text-[11px] font-bold uppercase tracking-wider text-neutral-500'
                        : 'mb-2 text-[11px] font-bold uppercase tracking-wider text-neutral-400'
                    }
                  >
                    {group.label}
                  </h2>
                )}
                <ul
                  className={
                    isLight
                      ? 'divide-y divide-neutral-200 overflow-hidden rounded-lg border border-neutral-300 bg-white'
                      : 'divide-y divide-white/5 overflow-hidden rounded-lg border border-white/10 bg-white/5'
                  }
                >
                  {group.items.map((m) => {
                    const kind = statusKind(m.status);
                    const played = kind === 'done' || kind === 'live';
                    return (
                      <li
                        key={m.id}
                        className="flex items-center gap-3 px-3 py-2 text-sm"
                      >
                        <span
                          className={
                            isLight
                              ? 'w-12 shrink-0 tabular-nums text-neutral-500'
                              : 'w-12 shrink-0 tabular-nums text-neutral-400'
                          }
                        >
                          {formatTime(m.scheduled_at)}
                        </span>
                        <span className="flex min-w-0 flex-1 items-center justify-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-right font-medium">
                            {m.team1_name ?? t.tbd}
                          </span>
                          <span className="shrink-0 tabular-nums font-semibold">
                            {played
                              ? `${m.team1_score ?? 0} - ${m.team2_score ?? 0}`
                              : t.vs}
                          </span>
                          <span className="min-w-0 flex-1 truncate font-medium">
                            {m.team2_name ?? t.tbd}
                          </span>
                        </span>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusPillClass(
                            kind
                          )}`}
                        >
                          {statusLabel[kind]}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
