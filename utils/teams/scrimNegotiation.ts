// utils/teams/scrimNegotiation.ts
// Helpers partagés pour la négociation multi-créneaux des scrims
// (proposition / contre-proposition). La négociation vit dans
// `demandes.payload.scrim_nego` sur la ligne `type='scrim'`.
//
// Shape (contrat partagé avec l'UI) :
//   payload.scrim_nego = {
//     slots: string[],          // ISO datetimes actuellement SUR LA TABLE
//     proposed_by: string,      // team id qui a proposé `slots`
//     rounds: number,           // 1 à la création, +1 par contre-proposition
//     agreed_slot: string|null  // défini quand un créneau est accepté
//   }
//
// Invariant back-compat : payload.preferred_date == slots[0]
// (== agreed_slot une fois accepté).

export const MAX_SCRIM_SLOTS = 5;

export type ScrimNego = {
  slots: string[];
  proposed_by: string | null;
  rounds: number;
  agreed_slot: string | null;
};

export type NormalizeSlotsResult =
  | { ok: true; slots: string[] }
  | { ok: false; error: string };

/**
 * Valide et normalise une liste de créneaux ISO :
 *  - 1..MAX_SCRIM_SLOTS éléments
 *  - chaque chaîne doit parser en date valide
 *  - dédupliqué (sur la forme ISO canonique), ordre préservé
 *  Les dates sont renvoyées au format ISO canonique (toISOString()).
 */
export function normalizeSlots(input: unknown): NormalizeSlotsResult {
  if (!Array.isArray(input)) {
    return { ok: false, error: 'Aucun créneau proposé.' };
  }
  const seen = new Set<string>();
  const slots: string[] = [];
  for (const raw of input) {
    if (typeof raw !== 'string' || !raw.trim()) {
      return { ok: false, error: 'Créneau invalide.' };
    }
    const d = new Date(raw.trim());
    if (isNaN(d.getTime())) {
      return { ok: false, error: `Date invalide : ${raw}` };
    }
    const iso = d.toISOString();
    if (seen.has(iso)) continue;
    seen.add(iso);
    slots.push(iso);
  }
  if (slots.length === 0) {
    return { ok: false, error: 'Propose au moins un créneau.' };
  }
  if (slots.length > MAX_SCRIM_SLOTS) {
    return {
      ok: false,
      error: `Maximum ${MAX_SCRIM_SLOTS} créneaux par proposition.`,
    };
  }
  return { ok: true, slots };
}

/**
 * Lit l'état de négociation d'un payload de demande scrim avec fallback
 * legacy : les demandes créées avant la négociation multi-créneaux n'ont pas
 * de `scrim_nego`, on le reconstruit depuis `preferred_date` + `from_team_id`.
 */
export function readScrimNego(payload: Record<string, unknown>): ScrimNego {
  const raw = payload.scrim_nego as Partial<ScrimNego> | undefined | null;
  const fromTeamId = (payload.from_team_id as string | null) ?? null;
  const preferred = (payload.preferred_date as string | null) ?? null;

  if (raw && Array.isArray(raw.slots) && raw.slots.length > 0) {
    return {
      slots: raw.slots,
      proposed_by: raw.proposed_by ?? fromTeamId,
      rounds: typeof raw.rounds === 'number' ? raw.rounds : 1,
      agreed_slot: raw.agreed_slot ?? null,
    };
  }

  // Legacy single-slot demande.
  return {
    slots: preferred ? [preferred] : [],
    proposed_by: fromTeamId,
    rounds: 1,
    agreed_slot: null,
  };
}
