// utils/statusConfig.ts
// Shared match status configuration for admin UI

import type { MatchStatus } from '@/types/admin';

export type StatusConfig = {
  label: string;
  dot: string;
  bg: string;
};

export const STATUS_CONFIG: Record<MatchStatus, StatusConfig> = {
  pending: {
    label: 'A venir',
    dot: 'bg-amber-400',
    bg: 'bg-amber-400/10 text-amber-300 border-amber-400/20',
  },
  ongoing: {
    label: 'En cours',
    dot: 'bg-green-400 animate-pulse',
    bg: 'bg-green-400/10 text-green-300 border-green-400/20',
  },
  finished: {
    label: 'Terminé',
    dot: 'bg-neutral-500',
    bg: 'bg-neutral-500/10 text-neutral-400 border-neutral-500/20',
  },
  cancelled: {
    label: 'Annulé',
    dot: 'bg-red-500',
    bg: 'bg-red-500/10 text-red-400 border-red-500/20',
  },
  postponed: {
    label: 'Reporté',
    dot: 'bg-blue-400',
    bg: 'bg-blue-400/10 text-blue-300 border-blue-400/20',
  },
  disputed: {
    label: 'Contesté',
    dot: 'bg-orange-400 animate-pulse',
    bg: 'bg-orange-400/10 text-orange-300 border-orange-400/20',
  },
  walkover: {
    label: 'Walkover',
    dot: 'bg-purple-400',
    bg: 'bg-purple-400/10 text-purple-300 border-purple-400/20',
  },
};
