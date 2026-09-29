// features/admin/teams/service/common.ts — briques partagées des services des
// équipes : erreurs au corps historique des routes d'origine.

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

/** Premier élément d'un paramètre de requête (`?a=1&a=2` → `'1'`). */
export function queryString(raw: unknown): string | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/** `'1'` ou `'true'`, comme les routes d'origine lisaient un drapeau. */
export function isTruthyFlag(raw: unknown): boolean {
  return raw === '1' || raw === 'true';
}
