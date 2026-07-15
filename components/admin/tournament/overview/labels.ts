// Pure presentational label/color helpers for the tournament overview
// sub-components. Moved verbatim from pages/admin/tournament/[id].tsx so the
// memoized row components can share them without pulling the whole page.

import type { MatchStatus } from '@/types/admin';
import type { Dict } from './types';

export function stageTypeLabel(tx: Dict, type: string | null) {
  switch (type) {
    case 'group':
      return tx.stageTypeGroup;
    case 'bracket':
      return tx.stageTypeBracket;
    case 'swiss':
      return tx.stageTypeSwiss;
    case 'round_robin':
      return tx.stageTypeRoundRobin;
    case 'showmatch':
      return tx.stageTypeShowmatch;
    default:
      return tx.stageTypeOther;
  }
}

export function stageTypeColor(t: string | null) {
  switch (t) {
    case 'bracket':
      return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
    case 'swiss':
      return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
    case 'group':
      return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
    case 'round_robin':
      return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
    case 'showmatch':
      return 'bg-pink-500/20 text-pink-300 border-pink-500/30';
    default:
      return 'bg-neutral-500/20 text-neutral-300 border-neutral-500/30';
  }
}

export function matchStatusLabel(tx: Dict, status: MatchStatus) {
  switch (status) {
    case 'pending':
      return tx.matchStatusPending;
    case 'ongoing':
      return tx.matchStatusOngoing;
    case 'finished':
      return tx.matchStatusFinished;
    case 'cancelled':
      return tx.matchStatusCancelled;
    default:
      return status;
  }
}

export function matchStatusColor(status: MatchStatus) {
  switch (status) {
    case 'pending':
      return 'bg-neutral-600 text-neutral-100';
    case 'ongoing':
      return 'bg-amber-600 text-white';
    case 'finished':
      return 'bg-emerald-600 text-white';
    case 'cancelled':
      return 'bg-red-600 text-white';
    default:
      return 'bg-neutral-600 text-neutral-100';
  }
}
