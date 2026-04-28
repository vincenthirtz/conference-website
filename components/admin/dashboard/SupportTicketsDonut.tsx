// components/admin/dashboard/SupportTicketsDonut.tsx
// Donut SVG pour la répartition des tickets support ouverts par catégorie.
// La sévérité (low/medium/high) influe la luminosité globale.

import type { TicketsBreakdown } from '@/utils/dashboard/buildTournamentDashboard';

type Props = {
  tickets: TicketsBreakdown;
  size?: number;
  strokeWidth?: number;
};

const CATEGORY_COLORS: Record<keyof TicketsBreakdown['byCategory'], string> = {
  dispute: '#ef4444', // red-500
  behavior: '#f59e0b', // amber-500
  technical: '#3b82f6', // blue-500
  other: '#6b7280', // gray-500
};

const CATEGORY_LABEL: Record<keyof TicketsBreakdown['byCategory'], string> = {
  dispute: 'Litiges',
  behavior: 'Comportement',
  technical: 'Technique',
  other: 'Autre',
};

export default function SupportTicketsDonut({
  tickets,
  size = 120,
  strokeWidth = 16,
}: Props) {
  const total = tickets.totalOpen;
  if (total === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-3">
        <div
          className="flex items-center justify-center rounded-full border border-dashed border-emerald-500/30 text-emerald-300"
          style={{ width: size, height: size }}
        >
          <span className="text-3xl">✓</span>
        </div>
        <p className="text-xs text-gray-400">Aucun ticket ouvert.</p>
      </div>
    );
  }

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // On accumule l'offset des arcs autour du cercle.
  let offset = 0;
  const arcs = (
    Object.keys(tickets.byCategory) as (keyof TicketsBreakdown['byCategory'])[]
  )
    .map((cat) => {
      const count = tickets.byCategory[cat];
      if (count === 0) return null;
      const fraction = count / total;
      const arcLength = fraction * circumference;
      const arc = (
        <circle
          key={cat}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke={CATEGORY_COLORS[cat]}
          strokeWidth={strokeWidth}
          // strokeDasharray = "<arc> <reste>", strokeDashoffset = offset négatif pour rotation
          strokeDasharray={`${arcLength} ${circumference - arcLength}`}
          strokeDashoffset={-offset}
          // 3px gap entre les arcs pour la lisibilité (uniquement si plus d'une catégorie)
          strokeLinecap="butt"
        />
      );
      offset += arcLength;
      return arc;
    })
    .filter(Boolean);

  // % par sévérité (texte sous le donut)
  const sevTotal = total;
  const sevPct = {
    high: Math.round((tickets.bySeverity.high / sevTotal) * 100),
    medium: Math.round((tickets.bySeverity.medium / sevTotal) * 100),
    low: Math.round((tickets.bySeverity.low / sevTotal) * 100),
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          // Démarre l'arc à 12h (par défaut SVG c'est 3h) et tourne dans le sens horaire.
          style={{ transform: 'rotate(-90deg)' }}
        >
          {arcs}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-2xl font-bold text-white">{total}</div>
          <div className="text-[9px] uppercase tracking-widest text-gray-500">
            ouverts
          </div>
        </div>
      </div>

      {/* Légende — catégories avec count > 0 uniquement */}
      <ul className="grid w-full grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
        {(
          Object.keys(
            tickets.byCategory
          ) as (keyof TicketsBreakdown['byCategory'])[]
        )
          .filter((cat) => tickets.byCategory[cat] > 0)
          .map((cat) => (
            <li key={cat} className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: CATEGORY_COLORS[cat] }}
              />
              <span className="text-gray-300">{CATEGORY_LABEL[cat]}</span>
              <span className="ml-auto tabular-nums text-gray-400">
                {tickets.byCategory[cat]}
              </span>
            </li>
          ))}
      </ul>

      {/* Sévérité globale */}
      {(tickets.bySeverity.high > 0 ||
        tickets.bySeverity.medium > 0 ||
        tickets.bySeverity.low > 0) && (
        <div className="flex w-full items-center gap-2 text-[10px] text-gray-400">
          <span className="text-gray-500">Sévérité :</span>
          {tickets.bySeverity.high > 0 && (
            <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-red-200">
              Haute {sevPct.high}%
            </span>
          )}
          {tickets.bySeverity.medium > 0 && (
            <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-amber-200">
              Moyenne {sevPct.medium}%
            </span>
          )}
          {tickets.bySeverity.low > 0 && (
            <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-blue-200">
              Basse {sevPct.low}%
            </span>
          )}
        </div>
      )}
    </div>
  );
}
