// components/player/RatingChart.tsx
//
// Courbe de rating de la fiche publique d'une joueuse — sparkline SVG maison,
// aucune dépendance de charts dans le repo.
//
// Extraite de `pages/player/[userId].tsx` sans changement de rendu. Le calcul
// géométrique vit dans `projectRatingSeries`, PUR, pour être testé sans DOM :
// c'est lui qui décide du point de départ, des bornes et du delta affichés, et
// une erreur là-dedans montre une progression fausse sans que rien ne casse.

import type { JSX } from 'react';
import type { PlayerProfileHistoryPoint } from '@/types/rating';
import { useT, format } from '@/lib/i18n/useT';
import nsPlayerPublicProfile from '@/lib/i18n/locales/fr/playerPublicProfile';

export const CHART_WIDTH = 720;
export const CHART_HEIGHT = 200;
const PAD_X = 8;
const PAD_Y = 16;

export type RatingSeriesProjection = {
  values: number[];
  min: number;
  max: number;
  first: number;
  last: number;
  /** Écart arrondi entre le premier et le dernier point. */
  delta: number;
  points: Array<{ x: number; y: number }>;
  linePath: string;
  areaPath: string;
};

/**
 * Projette l'historique dans le repère SVG (`CHART_WIDTH` × `CHART_HEIGHT`).
 *
 * La série part du `ratingBefore` du premier match (le point de départ), puis
 * suit le `ratingAfter` de chaque match. Moins de deux matchs : `null`, une
 * courbe à un point ne montre aucune progression.
 */
export function projectRatingSeries(
  history: readonly PlayerProfileHistoryPoint[]
): RatingSeriesProjection | null {
  if (history.length < 2) return null;

  const W = CHART_WIDTH;
  const H = CHART_HEIGHT;

  const values = [
    history[0].ratingBefore,
    ...history.map((h) => h.ratingAfter),
  ];
  const min = Math.min(...values);
  const max = Math.max(...values);
  // Série plate : `|| 1` évite une division par zéro (la ligne reste en bas).
  const span = max - min || 1;

  const stepX = (W - PAD_X * 2) / (values.length - 1);
  const scaleY = (v: number) =>
    PAD_Y + (H - PAD_Y * 2) * (1 - (v - min) / span);

  const points = values.map((v, i) => ({
    x: PAD_X + i * stepX,
    y: scaleY(v),
  }));

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(
    1
  )} ${H - PAD_Y} L ${points[0].x.toFixed(1)} ${H - PAD_Y} Z`;

  const last = values[values.length - 1];
  const first = values[0];

  return {
    values,
    min,
    max,
    first,
    last,
    delta: Math.round(last - first),
    points,
    linePath,
    areaPath,
  };
}

export default function RatingChart({
  history,
}: {
  history: PlayerProfileHistoryPoint[];
}): JSX.Element {
  const t = useT(nsPlayerPublicProfile);
  const projection = projectRatingSeries(history);
  if (!projection) {
    return (
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-8 text-center text-sm text-neutral-400">
        {t.chartNotEnough}
      </div>
    );
  }

  const { min, max, first, last, delta, points, linePath, areaPath } =
    projection;

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
      <div className="mb-2 flex items-center justify-between text-xs text-neutral-400">
        <span>{format(t.chartMin, { value: Math.round(min) })}</span>
        <span
          className={
            delta > 0
              ? 'text-emerald-400'
              : delta < 0
                ? 'text-rose-400'
                : 'text-neutral-400'
          }
        >
          {format(t.chartPts, { delta: `${delta > 0 ? '+' : ''}${delta}` })}
        </span>
        <span>{format(t.chartMax, { value: Math.round(max) })}</span>
      </div>
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className="h-40 w-full sm:h-48"
        preserveAspectRatio="none"
        role="img"
        aria-label={format(t.chartAriaLabel, {
          first: Math.round(first),
          last: Math.round(last),
          count: history.length,
        })}
      >
        <defs>
          <linearGradient id="ratingFill" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              stopColor="var(--color-violet)"
              stopOpacity="0.35"
            />
            <stop
              offset="100%"
              stopColor="var(--color-violet)"
              stopOpacity="0"
            />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#ratingFill)" />
        <path
          d={linePath}
          fill="none"
          stroke="var(--color-violet-light)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={2.5}
            fill="var(--color-violet-light)"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
    </div>
  );
}
