// components/ui/Badge.tsx
//
// Pastille (rôle, statut, compteur), au look `/admin`.
//
// Une quinzaine de variantes manuscrites coexistaient — mêmes classes à un
// `px` près, chacune avec sa propre table de couleurs recopiée. Le composant
// fixe la forme et n'expose qu'un `tone`, ce qui évite la dérive suivante :
// deux pastilles « capitaine » de deux teintes de vert différentes selon la
// page qui les rend.
//
// Ne remplace PAS `StatusBadge` (statut de match), qui porte une sémantique
// métier et sa propre table `STATUS_CONFIG`.

import type { ReactNode } from 'react';

export type BadgeTone =
  | 'neutral'
  | 'emerald'
  | 'amber'
  | 'red'
  | 'purple'
  | 'blue';

type BadgeProps = {
  children: ReactNode;
  tone?: BadgeTone;
  /** 'sm' = text-[11px] (défaut) ; 'xs' pour les compteurs très denses. */
  size?: 'xs' | 'sm';
  className?: string;
};

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-neutral-600/20 text-neutral-300 border-neutral-500/30',
  emerald: 'bg-emerald-600/20 text-emerald-200 border-emerald-500/30',
  amber: 'bg-amber-600/20 text-amber-200 border-amber-500/30',
  red: 'bg-red-600/20 text-red-200 border-red-500/30',
  purple: 'bg-purple-600/20 text-purple-200 border-purple-500/30',
  blue: 'bg-blue-600/20 text-blue-200 border-blue-500/30',
};

const SIZES = {
  xs: 'px-1.5 py-0.5 text-[10px]',
  sm: 'px-2 py-0.5 text-[11px]',
} as const;

export default function Badge({
  children,
  tone = 'neutral',
  size = 'sm',
  className = '',
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border font-medium ${SIZES[size]} ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
