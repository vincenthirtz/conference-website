// components/predictions/predictionCopy.ts
//
// Formulations partagées par la carte de match et le panneau TCG : un même
// résultat doit se dire pareil aux deux endroits.

import { format } from '@/lib/i18n/useT';
import { AdminFetchError } from '@/hooks/useAdminFetch';
import type nsMatchPrediction from '@/lib/i18n/locales/fr/matchPrediction';

export type PredictionDict = typeof nsMatchPrediction.fr;

export type PredictionResultValue = 'won' | 'lost' | 'void' | null;

export function resultLabel(
  result: PredictionResultValue,
  reward: number,
  t: PredictionDict
): string {
  switch (result) {
    case 'won':
      return format(t.resultWon, { coins: reward });
    case 'lost':
      return t.resultLost;
    case 'void':
      return t.resultVoid;
    default:
      return t.resultPending;
  }
}

/** Couleur d'état : juste, manqué, sans suite, en attente. */
export function resultTone(result: PredictionResultValue): string {
  switch (result) {
    case 'won':
      return 'text-emerald-300';
    case 'lost':
      return 'text-rose-300';
    default:
      return 'text-gray-400';
  }
}

/** Message d'échec d'une écriture, selon le code rendu par l'API. */
export function writeErrorLabel(err: unknown, t: PredictionDict): string {
  const payload =
    err instanceof AdminFetchError
      ? (err.payload as { code?: unknown } | null)
      : null;
  return payload?.code === 'locked' ? t.errorLocked : t.errorGeneric;
}
