// components/overlay/match/DayScheduleSource.tsx
//
// La source « matchs du jour » : le programme d'une journée, tel qu'il
// s'affiche dans OBS (plein cadre 1920×1080, fond transparent autour du
// panneau).
//
// Mêmes partis pris visuels que les sources par match (cf. MatchSources) :
// panneau sombre opaque, gros caractères, aucune animation continue hormis le
// point « en direct ». Le match du moment est cerclé de la couleur d'accent ;
// les matchs terminés passent en retrait pour que l'œil aille à ce qui vient.

import { useT, format } from '@/lib/i18n/useT';
import nsOverlay from '@/lib/i18n/locales/fr/overlay';
import type { OverlayDayResponse } from '@/pages/api/overlay/day';
import type { OverlayDayMatchView } from '@/utils/overlay/dayOverlay';
import { dayWindow, OVERLAY_DAY_TIME_ZONE } from '@/utils/overlay/dayOverlay';
import type { OverlayTeamView } from '@/utils/overlay/matchOverlay';
import { TeamLogo, hourLabel } from '@/components/overlay/match/MatchSources';

type Dict = typeof nsOverlay.fr;

/** « vendredi 18 septembre », à partir de la clé `YYYY-MM-DD`. */
export function dayLabel(date: string, locale: string): string {
  const [y, m, d] = date.split('-').map(Number);
  // Midi UTC : toujours le même jour calendaire à Paris, quelle que soit l'heure.
  const noon = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1, 12));
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: OVERLAY_DAY_TIME_ZONE,
  }).format(noon);
}

function TeamCell({
  team,
  align,
  dim,
  t,
}: {
  team: OverlayTeamView | null;
  align: 'left' | 'right';
  dim: boolean;
  t: Dict;
}) {
  const name = team?.name?.trim() || t.dayTeamTbd;
  return (
    <div
      className={`flex min-w-0 flex-1 items-center gap-4 ${
        align === 'right' ? 'flex-row-reverse text-right' : ''
      }`}
    >
      <TeamLogo team={team} size="sm" fallback={name} />
      <span
        className={`truncate text-3xl font-bold ${
          dim && !team?.isWinner ? 'text-white/50' : 'text-white'
        } ${team ? '' : 'italic text-white/50'}`}
      >
        {name}
      </span>
    </div>
  );
}

function MatchLine({
  match,
  current,
  accent,
  t,
}: {
  match: OverlayDayMatchView;
  current: boolean;
  accent: string;
  t: Dict;
}) {
  const final = match.phase === 'final';
  const live = match.phase === 'live';
  const time = hourLabel(match.scheduledAt ?? match.startedAt);

  return (
    <li
      className={`flex items-center gap-6 rounded-xl border-2 px-6 py-4 ${
        current ? 'bg-white/[0.09]' : 'border-transparent bg-white/[0.03]'
      }`}
      style={current ? { borderColor: accent } : undefined}
    >
      <div className="w-28 shrink-0 text-2xl font-bold tabular-nums text-white/70">
        {time ?? '—'}
      </div>
      <TeamCell team={match.team1} align="right" dim={final} t={t} />
      <div className="flex w-40 shrink-0 flex-col items-center">
        {final || live ? (
          <span className="text-4xl font-black tabular-nums text-white">
            {match.team1?.score ?? 0}
            <span className="mx-2 text-white/30">:</span>
            {match.team2?.score ?? 0}
          </span>
        ) : (
          <span className="text-2xl font-black text-white/40">{t.vs}</span>
        )}
      </div>
      <TeamCell team={match.team2} align="left" dim={final} t={t} />
      <div className="flex w-40 shrink-0 justify-end">
        {live ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-red-600 px-3 py-1 text-sm font-bold uppercase tracking-wider text-white">
            <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
            {t.matchPhaseLive}
          </span>
        ) : final ? (
          <span className="text-sm font-bold uppercase tracking-wider text-white/40">
            {t.matchPhaseFinal}
          </span>
        ) : match.format ? (
          <span className="text-sm font-bold uppercase tracking-wider text-white/50">
            {match.format.toUpperCase()}
          </span>
        ) : null}
      </div>
    </li>
  );
}

export function DayScheduleSource({
  payload,
  accent,
  scale,
  limit,
  locale,
}: {
  payload: OverlayDayResponse | null;
  accent: string;
  scale: number;
  limit: number;
  locale: string;
}) {
  const t = useT(nsOverlay);
  if (!payload) return null;

  const rows = dayWindow(payload.matches, payload.currentMatchId, limit);
  const title =
    payload.tournament.name ?? payload.branding?.name ?? t.brandFallback;

  return (
    <div className="flex h-full w-full items-center justify-center">
      <div
        className="w-[1500px] origin-center rounded-3xl border border-white/10 bg-black/85 p-10 shadow-2xl"
        style={{ transform: scale !== 1 ? `scale(${scale})` : undefined }}
      >
        <header className="mb-8 flex items-end justify-between gap-6">
          <div className="min-w-0">
            <div
              className="text-lg font-bold uppercase tracking-[0.3em]"
              style={{ color: accent }}
            >
              {t.dayEyebrow}
            </div>
            <h1 className="mt-1 truncate text-5xl font-black text-white">
              {title}
            </h1>
          </div>
          <div className="shrink-0 text-3xl font-semibold capitalize text-white/70">
            {dayLabel(payload.date, locale)}
          </div>
        </header>

        {rows.length === 0 ? (
          <p className="py-16 text-center text-3xl text-white/60">
            {t.dayEmpty}
          </p>
        ) : (
          <ol className="flex flex-col gap-3">
            {rows.map((m) => (
              <MatchLine
                key={m.id}
                match={m}
                current={m.id === payload.currentMatchId}
                accent={accent}
                t={t}
              />
            ))}
          </ol>
        )}

        {payload.matches.length > rows.length && (
          <p className="mt-6 text-right text-xl text-white/40">
            {format(t.dayShownOf, {
              shown: rows.length,
              total: payload.matches.length,
            })}
          </p>
        )}
      </div>
    </div>
  );
}
