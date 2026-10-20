// components/admin/moderation/libraryBans.ts — règles PURES du formulaire de
// bannissement de la Library (onglet « Library » de /admin/moderation).
//
// La validation passe par le schéma du contrat (`LibraryBanCreateBody`, copie
// synchronisée depuis conference-api) : le formulaire refuse exactement ce que
// la route refuserait, avec les mêmes bornes, sans les recopier ici.

import {
  LIBRARY_BAN_REASON_MAX,
  LibraryBanCreateBody,
  type LibraryBanCreateInput,
} from '@/features/admin/library/schemas';

export { LIBRARY_BAN_REASON_MAX };

/** Durées proposées : un `until` calculé, ou `null` (définitif). */
export type BanDurationPreset = '24h' | '7d' | '30d' | 'permanent';

export const BAN_DURATION_PRESETS: readonly BanDurationPreset[] = [
  '24h',
  '7d',
  '30d',
  'permanent',
];

const HOUR_MS = 3_600_000;
const PRESET_MS: Record<Exclude<BanDurationPreset, 'permanent'>, number> = {
  '24h': 24 * HOUR_MS,
  '7d': 7 * 24 * HOUR_MS,
  '30d': 30 * 24 * HOUR_MS,
};

/** Échéance ISO d'une durée, comptée depuis `nowMs` ; `null` = définitif. */
export function untilFromPreset(
  preset: BanDurationPreset,
  nowMs: number
): string | null {
  if (preset === 'permanent') return null;
  return new Date(nowMs + PRESET_MS[preset]).toISOString();
}

/** Le ticket donne les deux : l'identifiant de compte, ou le pseudo. */
export type BanTargetMode = 'userId' | 'nickname';

export type BanFormValues = {
  mode: BanTargetMode;
  target: string;
  reason: string;
  preset: BanDurationPreset;
};

/** Champ fautif, dans l'ordre du formulaire (le premier reçoit le focus). */
export type BanFormError =
  | { field: 'target'; kind: 'invalid' }
  | { field: 'reason'; kind: 'required' | 'tooLong' };

export type BanFormResult =
  | { ok: true; body: LibraryBanCreateInput }
  | { ok: false; errors: BanFormError[] };

/**
 * Corps du POST, validé par le schéma du contrat. Un identifiant collé avec
 * des espaces autour (copie depuis le ticket) est accepté : on rogne avant.
 */
export function buildBanBody(
  values: BanFormValues,
  nowMs: number
): BanFormResult {
  const target = values.target.trim();
  const candidate = {
    ...(values.mode === 'userId' ? { userId: target } : { nickname: target }),
    reason: values.reason,
    until: untilFromPreset(values.preset, nowMs),
  };
  const parsed = LibraryBanCreateBody.safeParse(candidate);
  if (parsed.success) return { ok: true, body: parsed.data };

  const errors: BanFormError[] = [];
  const seen = new Set<string>();
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0] ?? '');
    if (seen.has(key)) continue;
    seen.add(key);
    if (key === 'userId' || key === 'nickname') {
      errors.push({ field: 'target', kind: 'invalid' });
    } else if (key === 'reason') {
      errors.push({
        field: 'reason',
        kind: values.reason.trim() ? 'tooLong' : 'required',
      });
    }
  }
  // Ordre du formulaire : la cible avant le motif.
  errors.sort((a, b) =>
    a.field === b.field ? 0 : a.field === 'target' ? -1 : 1
  );
  return { ok: false, errors };
}
