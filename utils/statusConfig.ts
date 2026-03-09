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
};
