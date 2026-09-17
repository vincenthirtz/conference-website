// components/overlay/match/UpcomingScrimsSource.tsx
//
// La source « scrims à venir » : les prochains scrims publics, UNE LIGNE PAR
// SCRIM, sur fond transparent — ni panneau, ni titre. La régie compose la
// scène autour (son habillage, la vidéo) ; la source n'apporte que
// l'information : quand, et qui contre qui.
//
// Lisibilité par-dessus n'importe quelle image : chaque ligne porte son propre
// bandeau sombre et les textes une ombre portée. Pas d'animation continue
// hormis le point « en direct » (cf. MatchSources).

import { useT } from '@/lib/i18n/useT';
import nsOverlay from '@/lib/i18n/locales/fr/overlay';
import type { OverlayScrimsResponse } from '@/pages/api/overlay/scrims';
import type { OverlayScrimView } from '@/utils/overlay/scrimsOverlay';
import type { OverlayTeamView } from '@/utils/overlay/matchOverlay';
import { hourLabel } from '@/components/overlay/match/MatchSources';
import { OVERLAY_DAY_TIME_ZONE } from '@/utils/overlay/dayOverlay';

type Dict = typeof nsOverlay.fr;

export type ScrimsPosition = 'top' | 'center' | 'bottom';

/** `?position=` : top · center (défaut) · bottom. */
export function parseScrimsPosition(raw: string | undefined): ScrimsPosition {
  return raw === 'top' || raw === 'bottom' ? raw : 'center';
}

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

const SHADOW = { textShadow: '0 2px 6px rgba(0,0,0,0.8)' } as const;

function Logo({ team, name }: { team: OverlayTeamView | null; name: string }) {
  if (team?.logoUrl) {
    return (
      // biome-ignore lint/performance/noImgElement: source OBS — next/image n'apporte rien et casse sur un logo distant
      <img
        src={team.logoUrl}
        alt=""
        className="h-20 w-20 shrink-0 object-contain drop-shadow-lg"
      />
    );
  }
  return (
    <div
      className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-white/10 text-2xl font-black text-white/80"
      aria-hidden="true"
    >
      {name.slice(0, 2).toUpperCase()}
    </div>
  );
}

function ScrimLine({
  scrim,
  accent,
  locale,
  t,
}: {
  scrim: OverlayScrimView;
  accent: string;
  locale: string;
  t: Dict;
}) {
  const day = scrimDayLabel(scrim.scheduledAt, locale);
  const time = hourLabel(scrim.scheduledAt);
  const name1 = scrim.team1?.name?.trim() || t.dayTeamTbd;
  const name2 = scrim.team2?.name?.trim() || t.dayTeamTbd;

  return (
    <li className="flex h-28 w-[1500px] items-center gap-8 rounded-2xl bg-black/70 px-8">
      {/* L'horaire d'abord : c'est la colonne que l'œil cherche. */}
      <div className="w-48 shrink-0 leading-tight" style={SHADOW}>
        {scrim.phase === 'live' ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-red-600 px-4 py-1.5 text-lg font-bold uppercase tracking-wider text-white">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-white" />
            {t.matchPhaseLive}
          </span>
        ) : (
          <>
            <div
              className="text-xl font-bold uppercase tracking-wider"
              style={{ color: accent }}
            >
              {day ?? t.scrimsDateTbd}
            </div>
            <div className="text-4xl font-black tabular-nums text-white">
              {time ?? '—'}
            </div>
          </>
        )}
      </div>

      <div className="flex min-w-0 flex-1 items-center justify-end gap-5">
        <span
          className={`truncate text-4xl font-bold ${scrim.team1 ? 'text-white' : 'italic text-white/60'}`}
          style={SHADOW}
        >
          {name1}
        </span>
        <Logo team={scrim.team1} name={name1} />
      </div>

      <span
        className="shrink-0 text-3xl font-black text-white/50"
        style={SHADOW}
      >
        {t.vs}
      </span>

      <div className="flex min-w-0 flex-1 items-center gap-5">
        <Logo team={scrim.team2} name={name2} />
        <span
          className={`truncate text-4xl font-bold ${scrim.team2 ? 'text-white' : 'italic text-white/60'}`}
          style={SHADOW}
        >
          {name2}
        </span>
      </div>
    </li>
  );
}

const JUSTIFY: Record<ScrimsPosition, string> = {
  top: 'justify-start pt-16',
  center: 'justify-center',
  bottom: 'justify-end pb-16',
};

export function UpcomingScrimsSource({
  payload,
  accent,
  scale,
  position,
  locale,
}: {
  payload: OverlayScrimsResponse | null;
  accent: string;
  scale: number;
  position: ScrimsPosition;
  locale: string;
}) {
  const t = useT(nsOverlay);
  // Rien à venir : la source reste vide et transparente, plutôt qu'un message
  // qui s'imposerait à l'antenne.
  if (!payload || payload.scrims.length === 0) return null;

  return (
    <ol
      className={`flex h-full w-full flex-col items-center gap-4 ${JUSTIFY[position]}`}
      style={{
        transform: scale !== 1 ? `scale(${scale})` : undefined,
        transformOrigin:
          position === 'center' ? 'center' : `center ${position}`,
      }}
    >
      {payload.scrims.map((s) => (
        <ScrimLine key={s.id} scrim={s} accent={accent} locale={locale} t={t} />
      ))}
    </ol>
  );
}
