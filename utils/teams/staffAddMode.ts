// utils/teams/staffAddMode.ts
//
// Partie PURE de l'ajout staff (cf. utils/teams/staffInvitation.ts) : lecture
// du mode et du motif, et leurs bornes. Séparée pour que la modale d'ajout
// puisse importer les bornes sans embarquer supabaseAdmin dans le bundle client.

export type StaffAddMode = 'invite' | 'direct';

export const STAFF_DIRECT_ADD_REASON_MIN = 5;
export const STAFF_DIRECT_ADD_REASON_MAX = 500;

export type ParsedStaffAddMode =
  | { ok: true; mode: StaffAddMode; reason: string | null }
  | { ok: false; status: 400; error: string; code: string };

/**
 * Lit `mode` (défaut : invitation) et `reason` du corps de requête. Le motif
 * n'est exigé — et conservé — que pour l'ajout direct.
 */
export function parseStaffAddMode(body: unknown): ParsedStaffAddMode {
  const raw = (body ?? {}) as { mode?: unknown; reason?: unknown };
  const mode =
    raw.mode === undefined || raw.mode === null ? 'invite' : raw.mode;
  if (mode !== 'invite' && mode !== 'direct') {
    return {
      ok: false,
      status: 400,
      error: "mode doit valoir 'invite' ou 'direct'.",
      code: 'INVALID_MODE',
    };
  }
  if (mode === 'invite') return { ok: true, mode, reason: null };

  const reason = typeof raw.reason === 'string' ? raw.reason.trim() : '';
  if (
    reason.length < STAFF_DIRECT_ADD_REASON_MIN ||
    reason.length > STAFF_DIRECT_ADD_REASON_MAX
  ) {
    return {
      ok: false,
      status: 400,
      error: `Un ajout sans invitation exige un motif (${STAFF_DIRECT_ADD_REASON_MIN} à ${STAFF_DIRECT_ADD_REASON_MAX} caractères).`,
      code: 'REASON_REQUIRED',
    };
  }
  return { ok: true, mode, reason };
}
