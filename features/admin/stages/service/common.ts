// features/admin/stages/service/common.ts — briques partagées des services
// des phases : erreurs au format historique des routes d'origine, lecture
// typée des réglages JSONB d'une phase.

import type { Json } from '@/types/database.generated';
import type { StageSettings } from '@/types/stages';
import { LegacyAdminError } from '@/utils/admin/errors';

/** Erreur au corps historique (`code` métier et champs annexes conservés). */
export function fail(
  status: number,
  error: string,
  code?: string,
  extra?: Record<string, unknown>
): LegacyAdminError {
  return new LegacyAdminError(status, error, { code, extra });
}

/** `tournament_stages.settings` (JSONB) lu comme les routes le lisaient. */
export function settingsOf(settings: Json | null | undefined): StageSettings {
  return (settings ?? {}) as StageSettings;
}

/** Même lecture que `settings?.x` sur un JSONB possiblement NULL. */
export function settingsOrNull(
  settings: Json | null | undefined
): StageSettings | null {
  return (settings ?? null) as StageSettings | null;
}

export const stageNotFound = () => fail(404, 'Stage not found');

/** Un match du round 1 déjà lancé ou joué verrouille le seeding. */
export function isLockedStatus(status: string): boolean {
  return status === 'ongoing' || status === 'finished' || status === 'walkover';
}
