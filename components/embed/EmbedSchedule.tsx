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
  /** Sanitized hex accent (brand bar). Null → no accent bar. */
  accent?: string | null;
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

/** Up-to-2-char initials derived from a team name, for the logo fallback. */
function teamInitials(name: string | null): string {
  if (!name) return '';
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

const LOGO_SIZE = 18;

/**
 * Small rounded team logo with an initials fallback when no logo is set.
 * Plain <img> (embeds are chrome-less static HTML, no next/image).
 */
function TeamLogo({
  name,
  logoUrl,
  isLight,
}: {
  name: string | null;
  logoUrl: string | null;
  isLight: boolean;
}) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt={name ?? ''}
        width={LOGO_SIZE}
        height={LOGO_SIZE}
        loading="lazy"
        className="shrink-0 rounded-full object-cover"
        style={{ width: LOGO_SIZE, height: LOGO_SIZE }}
      />
    );
  }
  const initials = teamInitials(name);
  if (!initials) return null;
  return (
    <span
      aria-hidden="true"
      className={
        isLight
          ? 'flex shrink-0 items-center justify-center rounded-full bg-neutral-200 text-[8px] font-bold text-neutral-600'
          : 'flex shrink-0 items-center justify-center rounded-full bg-white/10 text-[8px] font-bold text-neutral-300'
      }
      style={{ width: LOGO_SIZE, height: LOGO_SIZE }}
    >
      {initials}
    </span>
  );
}

export default function EmbedSchedule({
  tournamentName,
  matches,
  theme,
  accent,
  publicUrl,
  siteLabel = 'le site',
}: EmbedScheduleProps) {
  const t = useT('embedSchedule');
  const isLight = theme === 'light';
  const accentStyle = accent ? { borderTop: `3px solid ${accent}` } : undefined;

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
      style={accentStyle}
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
                          <span className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
                            <span className="min-w-0 truncate text-right font-medium">
                              {m.team1_name ?? t.tbd}
                            </span>
                            <TeamLogo
                              name={m.team1_name}
                              logoUrl={m.team1_logo_url}
                              isLight={isLight}
                            />
                          </span>
                          <span className="shrink-0 tabular-nums font-semibold">
                            {played
                              ? `${m.team1_score ?? 0} - ${m.team2_score ?? 0}`
                              : t.vs}
                          </span>
                          <span className="flex min-w-0 flex-1 items-center justify-start gap-1.5">
                            <TeamLogo
                              name={m.team2_name}
                              logoUrl={m.team2_logo_url}
                              isLight={isLight}
                            />
                            <span className="min-w-0 truncate font-medium">
                              {m.team2_name ?? t.tbd}
                            </span>
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
