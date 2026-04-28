// components/admin/dashboard/StatCard.tsx
// Carte KPI réutilisable pour le mega-dashboard. Remplace les divs inline
// utilisés dans /admin/tournament/[id].tsx.

import type { ReactNode } from 'react';

export type StatAccent =
  | 'pink'
  | 'blue'
  | 'emerald'
  | 'purple'
  | 'amber'
  | 'red'
  | 'gray';

const ACCENT_RING: Record<StatAccent, string> = {
  pink: 'ring-pink-500/30 from-pink-500/10',
  blue: 'ring-blue-500/30 from-blue-500/10',
  emerald: 'ring-emerald-500/30 from-emerald-500/10',
  purple: 'ring-purple-500/30 from-purple-500/10',
  amber: 'ring-amber-500/30 from-amber-500/10',
  red: 'ring-red-500/30 from-red-500/10',
  gray: 'ring-white/10 from-white/5',
};

const ACCENT_TEXT: Record<StatAccent, string> = {
  pink: 'text-pink-300',
  blue: 'text-blue-300',
  emerald: 'text-emerald-300',
  purple: 'text-purple-300',
  amber: 'text-amber-300',
  red: 'text-red-300',
  gray: 'text-gray-300',
};

type Props = {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  accent?: StatAccent;
  /** Optional small icon prepended to the label. */
  icon?: ReactNode;
};

export default function StatCard({
  label,
  value,
  hint,
  accent = 'gray',
  icon,
}: Props) {
  return (
    <div
      className={`rounded-xl bg-gradient-to-br to-transparent ring-1 ${ACCENT_RING[accent]} bg-neutral-900/40 p-4`}
    >
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-gray-500 font-medium">
        {icon && <span className="opacity-80">{icon}</span>}
        <span>{label}</span>
      </div>
      <div className={`mt-1.5 text-2xl font-bold ${ACCENT_TEXT[accent]}`}>
        {value}
      </div>
      {hint !== undefined && hint !== null && hint !== '' && (
        <div className="mt-1 text-[11px] text-gray-500">{hint}</div>
      )}
    </div>
  );
}
