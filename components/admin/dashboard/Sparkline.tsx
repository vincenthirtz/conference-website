// components/admin/dashboard/Sparkline.tsx
// Mini-sparkline SVG (area + ligne + dot final) pour visualiser une cadence
// horaire. Utilisé sur StageProgressBar (matchs finis sur les 12 dernières heures).

import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminDashboardSparkline from '@/lib/i18n/locales/admin-fr/adminDashboardSparkline';

type Props = {
  values: number[];
  width?: number;
  height?: number;
  /** Couleur (tailwind classes via stroke="currentColor"). */
  className?: string;
  /** Tooltip natif au survol. */
  ariaLabel?: string;
};

export default function Sparkline({
  values,
  width = 84,
  height = 24,
  className = 'text-purple-300',
  ariaLabel,
}: Props) {
  const t = useAdminT(nsAdminDashboardSparkline);
  if (!values || values.length === 0) {
    return (
      <span
        className={`inline-block opacity-40 ${className}`}
        style={{ width, height }}
        aria-hidden="true"
      />
    );
  }

  const max = Math.max(...values, 1); // évite la div-by-zero, garantit une amplitude
  const stepX = values.length > 1 ? width / (values.length - 1) : width;

  // Padding vertical : on laisse 2px en haut et en bas pour ne pas couper la ligne
  const innerH = height - 4;
  const baseY = height - 2;

  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = baseY - (v / max) * innerH;
    return [x, y] as [number, number];
  });

  const linePath = points
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ');

  const areaPath = `${linePath} L${(points.at(-1)?.[0] ?? 0).toFixed(1)},${baseY} L0,${baseY} Z`;

  const last = points.at(-1);
  const total = values.reduce((s, v) => s + v, 0);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-label={
        ariaLabel ?? format(t.cadenceAria, { total, hours: values.length })
      }
      role="img"
    >
      <path d={areaPath} fill="currentColor" opacity={0.15} />
      <path
        d={linePath}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {last && <circle cx={last[0]} cy={last[1]} r={2} fill="currentColor" />}
    </svg>
  );
}
