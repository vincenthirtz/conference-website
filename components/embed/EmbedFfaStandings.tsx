// components/embed/EmbedFfaStandings.tsx
// Chrome-less, theme-aware FFA standings table for the iframe-embeddable
// read-only view. Mirrors EmbedStandings: no Navbar/Footer/Toast, a discreet
// "view on site" link, i18n via useT('ffaStandings'). Renders only the public,
// non-PII fields exposed by PublicFfaStandingRow.

import type { PublicFfaStandingRow } from '@/utils/public/readFfaStandings';
import { useT, format } from '@/lib/i18n/useT';

export type EmbedTheme = 'light' | 'dark';

type EmbedFfaStandingsProps = {
  tournamentName: string;
  stageName: string | null;
  standings: PublicFfaStandingRow[];
  theme: EmbedTheme;
  /** Optional canonical public URL for a discreet "view on site" link. */
  publicUrl?: string | null;
  siteLabel?: string;
};

export default function EmbedFfaStandings({
  tournamentName,
  stageName,
  standings,
  theme,
  publicUrl,
  siteLabel = 'le site',
}: EmbedFfaStandingsProps) {
  const t = useT('ffaStandings');
  const isLight = theme === 'light';

  const title = stageName
    ? `${tournamentName} · ${stageName}`
    : tournamentName;

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
            {title}
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

        {standings.length === 0 ? (
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
          <div
            className={
              isLight
                ? 'overflow-x-auto rounded-lg border border-neutral-300 bg-white'
                : 'overflow-x-auto rounded-lg border border-white/10 bg-white/5'
            }
          >
            <table className="w-full min-w-[420px] border-collapse text-sm">
              <thead>
                <tr
                  className={
                    isLight
                      ? 'border-b border-neutral-200 text-left text-[11px] uppercase tracking-wider text-neutral-500'
                      : 'border-b border-white/10 text-left text-[11px] uppercase tracking-wider text-neutral-400'
                  }
                >
                  <th className="w-12 px-3 py-2 text-right tabular-nums">
                    {t.colRank}
                  </th>
                  <th className="px-3 py-2">{t.colTeam}</th>
                  <th className="px-3 py-2 text-right tabular-nums">
                    {t.colPoints}
                  </th>
                  <th className="px-3 py-2 text-right tabular-nums">
                    {t.colLobbies}
                  </th>
                  <th className="px-3 py-2 text-right tabular-nums">
                    {t.colBest}
                  </th>
                  <th className="px-3 py-2 text-right tabular-nums">
                    {t.colFirsts}
                  </th>
                </tr>
              </thead>
              <tbody>
                {standings.map((s) => (
                  <tr
                    key={s.teamId}
                    className={
                      isLight
                        ? 'border-b border-neutral-100 last:border-0'
                        : 'border-b border-white/5 last:border-0'
                    }
                  >
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">
                      {s.rank}
                    </td>
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-2">
                        {s.logoUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={s.logoUrl}
                            alt=""
                            className="h-5 w-5 shrink-0 rounded-full object-cover"
                            loading="lazy"
                          />
                        )}
                        <span className="truncate">
                          {s.teamShortName || s.teamName || '—'}
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">
                      {s.totalPoints}
                    </td>
                    <td
                      className={
                        isLight
                          ? 'px-3 py-2 text-right tabular-nums text-neutral-600'
                          : 'px-3 py-2 text-right tabular-nums text-neutral-300'
                      }
                    >
                      {s.lobbiesPlayed}
                    </td>
                    <td
                      className={
                        isLight
                          ? 'px-3 py-2 text-right tabular-nums text-neutral-600'
                          : 'px-3 py-2 text-right tabular-nums text-neutral-300'
                      }
                    >
                      {s.bestPlacement === null ? '—' : `#${s.bestPlacement}`}
                    </td>
                    <td
                      className={
                        isLight
                          ? 'px-3 py-2 text-right tabular-nums text-neutral-600'
                          : 'px-3 py-2 text-right tabular-nums text-neutral-300'
                      }
                    >
                      {s.firsts}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
