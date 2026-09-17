// components/overlay/match/UpcomingScrimsSource.tsx
//
// La source « scrims à venir » : les prochains scrims publics, UN BANDEAU PAR
// SCRIM, sur fond transparent — ni panneau, ni titre. La régie compose la
// scène autour (son habillage, la vidéo) ; la source n'apporte que
// l'information : quand, et qui contre qui.
//
// Lisibilité par-dessus n'importe quelle image : chaque bandeau est sombre et
// les textes portent une ombre. Pas d'animation continue hormis le point « en
// direct » (cf. MatchSources).
//
// TAILLE : le bloc s'agrandit jusqu'à REMPLIR la source (cf. pickScrimsLayout).
// Deux gabarits, choisis selon la forme de la source :
//   - `row`  : une ligne longue (horaire | équipe VS équipe), pour une source
//              large ou beaucoup de scrims ;
//   - `card` : horaire au-dessus, équipes et grands logos dessous, pour une
//              source plus haute — typiquement UN scrim dans un encart, où une
//              ligne longue ne remplirait qu'une fine bande.

import type { CSSProperties } from 'react';
import { useT } from '@/lib/i18n/useT';
import nsOverlay from '@/lib/i18n/locales/fr/overlay';
import type { OverlayScrimsResponse } from '@/pages/api/overlay/scrims';
import type { OverlayScrimView } from '@/utils/overlay/scrimsOverlay';
import type { OverlayTeamView } from '@/utils/overlay/matchOverlay';
import { hourLabel } from '@/components/overlay/match/MatchSources';
import { OVERLAY_DAY_TIME_ZONE } from '@/utils/overlay/dayOverlay';
import { useViewportSize } from '@/hooks/useStageFit';

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

/* ── Gabarits et mise à l'échelle ──────────────────────────────────────── */

export type ScrimsLayout = 'row' | 'card';

/** Taille « de conception » d'un bandeau, en pixels, par gabarit. */
export const SCRIM_LAYOUTS: Record<ScrimsLayout, { w: number; h: number }> = {
  row: { w: 1600, h: 112 },
  card: { w: 1200, h: 300 },
};
export const SCRIM_GAP = 16;
/** Marge autour du bloc, pour que les coins arrondis ne touchent pas le bord. */
const SCRIM_MARGIN = 12;

/** Facteur qui fait tenir `count` bandeaux du gabarit dans la source. */
export function layoutFit(
  layout: ScrimsLayout,
  count: number,
  viewport: { width: number; height: number }
): number {
  const { w, h } = SCRIM_LAYOUTS[layout];
  const n = Math.max(1, count);
  const blockH = n * h + (n - 1) * SCRIM_GAP;
  return Math.min(
    viewport.width / (w + 2 * SCRIM_MARGIN),
    viewport.height / (blockH + 2 * SCRIM_MARGIN)
  );
}

/**
 * Le gabarit qui occupe le plus de surface dans la source, et son échelle
 * (multipliée par `?scale=`). À surface égale, la ligne l'emporte : elle est la
 * forme par défaut, la carte n'existe que pour mieux remplir.
 */
export function pickScrimsLayout(
  count: number,
  viewport: { width: number; height: number },
  scale = 1
): { layout: ScrimsLayout; fit: number } {
  const area = (layout: ScrimsLayout) => {
    const f = layoutFit(layout, count, viewport);
    const { w, h } = SCRIM_LAYOUTS[layout];
    return f * f * w * h;
  };
  const layout: ScrimsLayout = area('card') > area('row') ? 'card' : 'row';
  return { layout, fit: layoutFit(layout, count, viewport) * scale };
}

/* ── Briques ───────────────────────────────────────────────────────────── */

const SHADOW = { textShadow: '0 2px 6px rgba(0,0,0,0.8)' } as const;

function Logo({
  team,
  name,
  size,
}: {
  team: OverlayTeamView | null;
  name: string;
  size: 'md' | 'lg';
}) {
  const dim = size === 'lg' ? 'h-36 w-36 text-4xl' : 'h-20 w-20 text-2xl';
  if (team?.logoUrl) {
    return (
      // biome-ignore lint/performance/noImgElement: source OBS — next/image n'apporte rien et casse sur un logo distant
      <img
        src={team.logoUrl}
        alt=""
        className={`${dim} shrink-0 object-contain drop-shadow-lg`}
      />
    );
  }
  return (
    <div
      className={`${dim} flex shrink-0 items-center justify-center rounded-xl bg-white/10 font-black text-white/80`}
      aria-hidden="true"
    >
      {/* Adversaire pas encore connu : « ? », pas l'initiale de « À déterminer ». */}
      {team ? name.slice(0, 2).toUpperCase() : '?'}
    </div>
  );
}

function LiveBadge({ t, large }: { t: Dict; large?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full bg-red-600 font-bold uppercase tracking-wider text-white ${
        large ? 'px-5 py-2 text-2xl' : 'px-4 py-1.5 text-lg'
      }`}
    >
      <span className="block h-3 w-3 shrink-0 animate-pulse rounded-full bg-white" />
      {t.matchPhaseLive}
    </span>
  );
}

function TeamSide({
  team,
  name,
  align,
  size,
}: {
  team: OverlayTeamView | null;
  name: string;
  align: 'left' | 'right';
  size: 'md' | 'lg';
}) {
  return (
    <div
      className={`flex min-w-0 flex-1 items-center ${
        size === 'lg' ? 'gap-6' : 'gap-5'
      } ${align === 'right' ? 'flex-row-reverse' : ''}`}
    >
      <Logo team={team} name={name} size={size} />
      <span
        className={`truncate font-bold ${size === 'lg' ? 'text-5xl' : 'text-4xl'} ${
          team ? 'text-white' : 'italic text-white/60'
        }`}
        style={SHADOW}
      >
        {name}
      </span>
    </div>
  );
}

type LineProps = {
  scrim: OverlayScrimView;
  accent: string;
  locale: string;
  t: Dict;
};

function lineData({ scrim, locale, t }: LineProps) {
  return {
    day: scrimDayLabel(scrim.scheduledAt, locale) ?? t.scrimsDateTbd,
    time: hourLabel(scrim.scheduledAt) ?? '—',
    name1: scrim.team1?.name?.trim() || t.dayTeamTbd,
    name2: scrim.team2?.name?.trim() || t.dayTeamTbd,
    live: scrim.phase === 'live',
  };
}

/** Gabarit `row` : horaire | équipe 1 VS équipe 2, sur une ligne. */
function ScrimRow(props: LineProps) {
  const { scrim, accent, t } = props;
  const d = lineData(props);
  const { w, h } = SCRIM_LAYOUTS.row;
  return (
    <li
      className="flex items-center gap-8 rounded-2xl bg-black/70 px-8"
      style={{ width: w, height: h }}
    >
      {/* L'horaire d'abord : c'est la colonne que l'œil cherche. */}
      <div className="w-48 shrink-0 leading-tight" style={SHADOW}>
        {d.live ? (
          <LiveBadge t={t} />
        ) : (
          <>
            <div
              className="text-xl font-bold uppercase tracking-wider"
              style={{ color: accent }}
            >
              {d.day}
            </div>
            <div className="text-4xl font-black tabular-nums text-white">
              {d.time}
            </div>
          </>
        )}
      </div>
      <TeamSide team={scrim.team1} name={d.name1} align="right" size="md" />
      <span
        className="shrink-0 text-3xl font-black text-white/50"
        style={SHADOW}
      >
        {t.vs}
      </span>
      <TeamSide team={scrim.team2} name={d.name2} align="left" size="md" />
    </li>
  );
}

/** Gabarit `card` : horaire au-dessus, équipes et grands logos dessous. */
function ScrimCard(props: LineProps) {
  const { scrim, accent, t } = props;
  const d = lineData(props);
  const { w, h } = SCRIM_LAYOUTS.card;
  return (
    <li
      className="flex flex-col justify-center gap-5 rounded-3xl bg-black/70 px-10"
      style={{ width: w, height: h }}
    >
      <div className="flex items-baseline justify-center gap-5" style={SHADOW}>
        {d.live ? (
          <LiveBadge t={t} large />
        ) : (
          <>
            <span
              className="text-3xl font-bold uppercase tracking-wider"
              style={{ color: accent }}
            >
              {d.day}
            </span>
            <span className="text-5xl font-black tabular-nums text-white">
              {d.time}
            </span>
          </>
        )}
      </div>
      <div className="flex items-center gap-8">
        <TeamSide team={scrim.team1} name={d.name1} align="right" size="lg" />
        <span
          className="shrink-0 text-4xl font-black text-white/50"
          style={SHADOW}
        >
          {t.vs}
        </span>
        <TeamSide team={scrim.team2} name={d.name2} align="left" size="lg" />
      </div>
    </li>
  );
}

/** Ancrage vertical du bloc dans la source, et origine de sa mise à l'échelle. */
const ANCHOR: Record<ScrimsPosition, { top: string; y: string }> = {
  top: { top: `${SCRIM_MARGIN}px`, y: '0' },
  center: { top: '50%', y: '-50%' },
  bottom: { top: `calc(100% - ${SCRIM_MARGIN}px)`, y: '-100%' },
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
  const viewport = useViewportSize();
  // Rien à venir : la source reste vide et transparente, plutôt qu'un message
  // qui s'imposerait à l'antenne.
  if (!payload || payload.scrims.length === 0) return null;

  const { layout, fit } = pickScrimsLayout(
    payload.scrims.length,
    viewport,
    scale
  );
  const anchor = ANCHOR[position];
  const Line = layout === 'card' ? ScrimCard : ScrimRow;
  const style: CSSProperties = {
    width: SCRIM_LAYOUTS[layout].w,
    gap: SCRIM_GAP,
    top: anchor.top,
    transform: `translate(-50%, ${anchor.y}) scale(${fit})`,
    transformOrigin: `center ${position === 'center' ? 'center' : position}`,
  };

  return (
    <ol
      className="absolute left-1/2 flex flex-col"
      style={style}
      data-layout={layout}
    >
      {payload.scrims.map((s) => (
        <Line key={s.id} scrim={s} accent={accent} locale={locale} t={t} />
      ))}
    </ol>
  );
}
