// components/admin/bracket/statusTone.ts — ton de puce « Le Ruban » d'un
// statut de match (vues admin du bracket). La couleur signale : `live` pour
// ce qui se joue, `warn`/`err` pour ce qui demande une action, neutre sinon.
// Le libellé, lui, reste celui de `STATUS_CONFIG` (partagé avec le public).

import type { ChipTone } from '@/features/admin/_shared/ui/Chip';
import type { MatchStatus } from '@/types/admin';

export const MATCH_STATUS_TONE: Record<MatchStatus, ChipTone> = {
  pending: 'neutral',
  ongoing: 'live',
  finished: 'ok',
  cancelled: 'err',
  postponed: 'warn',
  disputed: 'err',
  walkover: 'neutral',
};
