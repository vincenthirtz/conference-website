// components/overlay/match/UpcomingScrimsSource.tsx
//
// La source « scrims à venir » : l'agenda des prochains scrims publics, tel
// qu'il s'affiche dans OBS (panneau centré, fond transparent autour).
//
// Mêmes partis pris que les autres sources (cf. MatchSources) : panneau sombre
// opaque, gros caractères, pas d'animation continue hormis le point « en
// direct ». Le prochain scrim (ou celui en cours) est cerclé de l'accent.

import { useT, format } from '@/lib/i18n/useT';
import nsOverlay from '@/lib/i18n/locales/fr/overlay';
import type { OverlayScrimsResponse } from '@/pages/api/overlay/scrims';
import type { OverlayScrimView } from '@/utils/overlay/scrimsOverlay';
import { TeamLogo, hourLabel } from '@/components/overlay/match/MatchSources';
import { OVERLAY_DAY_TIME_ZONE } from '@/utils/overlay/dayOverlay';

type Dict = typeof nsOverlay.fr;

/** « ven. 18 sept. », dans le fuseau de Paris. */
export function scrimDayLabel(
  iso: string | null,
  locale: string
): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: OVERLAY_DAY_TIME_ZONE,
  }).format(new Date(ms));
}

function ScrimLine({
  scrim,
  highlight,
  accent,
  locale,
  t,
}: {
  scrim: OverlayScrimView;
  highlight: boolean;
  accent: string;
  locale: string;
  t: Dict;
}) {
  const day = scrimDayLabel(scrim.scheduledAt, locale);
  const time = hourLabel(scrim.scheduledAt);
  const team = (v: OverlayScrimView['team1']) =>
    v?.name?.trim() || t.dayTeamTbd;

  return (
    <li
      className={`flex items-center gap-6 rounded-xl border-2 px-6 py-4 ${
        highlight ? 'bg-white/[0.09]' : 'border-transparent bg-white/[0.03]'
      }`}
      style={highlight ? { borderColor: accent } : undefined}
    >
      <div className="w-44 shrink-0 leading-tight">
        <div className="text-xl font-semibold capitalize text-white/60">
          {day ?? t.scrimsDateTbd}
        </div>
        <div className="text-3xl font-bold tabular-nums text-white">
          {time ?? '—'}
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-row-reverse items-center gap-4 text-right">
        <TeamLogo team={scrim.team1} size="sm" fallback={team(scrim.team1)} />
        <span
          className={`truncate text-3xl font-bold ${scrim.team1 ? 'text-white' : 'italic text-white/50'}`}
        >
          {team(scrim.team1)}
        </span>
      </div>
      <span className="w-16 shrink-0 text-center text-2xl font-black text-white/40">
        {t.vs}
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <TeamLogo team={scrim.team2} size="sm" fallback={team(scrim.team2)} />
        <span
          className={`truncate text-3xl font-bold ${scrim.team2 ? 'text-white' : 'italic text-white/50'}`}
        >
          {team(scrim.team2)}
        </span>
      </div>
      <div className="flex w-40 shrink-0 justify-end">
        {scrim.phase === 'live' && (
          <span className="inline-flex items-center gap-2 rounded-full bg-red-600 px-3 py-1 text-sm font-bold uppercase tracking-wider text-white">
            <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
            {t.matchPhaseLive}
          </span>
        )}
      </div>
    </li>
  );
}

export function UpcomingScrimsSource({
  payload,
  title,
  accent,
  scale,
  locale,
}: {
  payload: OverlayScrimsResponse | null;
  /** `?title=` ; sinon le libellé par défaut. */
  title: string | null;
  accent: string;
  scale: number;
  locale: string;
}) {
  const t = useT(nsOverlay);
  if (!payload) return null;

  return (
    <div className="flex h-full w-full items-center justify-center">
      <div
        className="w-[1500px] origin-center rounded-3xl border border-white/10 bg-black/85 p-10 shadow-2xl"
        style={{ transform: scale !== 1 ? `scale(${scale})` : undefined }}
      >
        <header className="mb-8">
          <div
            className="text-lg font-bold uppercase tracking-[0.3em]"
            style={{ color: accent }}
          >
            {payload.branding?.name ?? t.scrimsBrandDefault}
          </div>
          <h1 className="mt-1 truncate text-5xl font-black text-white">
            {title || t.scrimsTitle}
          </h1>
        </header>

        {payload.scrims.length === 0 ? (
          <p className="py-16 text-center text-3xl text-white/60">
            {t.scrimsEmpty}
          </p>
        ) : (
          <ol className="flex flex-col gap-3">
            {payload.scrims.map((s, i) => (
              <ScrimLine
                key={s.id}
                scrim={s}
                highlight={i === 0}
                accent={accent}
                locale={locale}
                t={t}
              />
            ))}
          </ol>
        )}

        {payload.total > payload.scrims.length && (
          <p className="mt-6 text-right text-xl text-white/40">
            {format(t.scrimsMore, {
              count: payload.total - payload.scrims.length,
            })}
          </p>
        )}
      </div>
    </div>
  );
}
